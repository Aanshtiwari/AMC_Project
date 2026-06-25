#!/usr/bin/env python3
"""Convert the reference XLSX workbook into browser-renderable report metadata."""

from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "p": "http://schemas.openxmlformats.org/package/2006/relationships",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}

INDEXED_COLORS = {
    "0": "#000000",
    "1": "#ffffff",
    "8": "#000000",
    "9": "#ffffff",
    "22": "#c0c0c0",
    "23": "#808080",
}


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def column_number(letters: str) -> int:
    value = 0
    for char in letters:
        value = value * 26 + ord(char.upper()) - 64
    return value


def column_letters(number: int) -> str:
    result = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        result = chr(65 + remainder) + result
    return result


def split_ref(ref: str) -> tuple[int, int]:
    match = re.fullmatch(r"([A-Z]+)(\d+)", ref)
    if not match:
        raise ValueError(f"Invalid cell reference: {ref}")
    return int(match.group(2)), column_number(match.group(1))


def parse_range(ref: str) -> tuple[int, int, int, int]:
    start, _, end = ref.partition(":")
    end = end or start
    row1, col1 = split_ref(start)
    row2, col2 = split_ref(end)
    return row1, col1, row2, col2


def read_xml(archive: zipfile.ZipFile, path: str) -> ET.Element:
    return ET.fromstring(archive.read(path))


def color_value(node: ET.Element | None) -> str | None:
    if node is None:
        return None
    rgb = node.get("rgb")
    if rgb:
        return f"#{rgb[-6:]}"
    indexed = node.get("indexed")
    if indexed:
        return INDEXED_COLORS.get(indexed)
    return None


def parse_styles(archive: zipfile.ZipFile) -> list[dict]:
    root = read_xml(archive, "xl/styles.xml")
    fonts = []
    fonts_node = root.find("m:fonts", NS)
    for font in fonts_node if fonts_node is not None else ():
        fonts.append({
            "family": (font.find("m:name", NS).get("val") if font.find("m:name", NS) is not None else "Arial"),
            "size": float(font.find("m:sz", NS).get("val")) if font.find("m:sz", NS) is not None else 10,
            "bold": font.find("m:b", NS) is not None,
            "italic": font.find("m:i", NS) is not None,
            "underline": font.find("m:u", NS) is not None,
            "color": color_value(font.find("m:color", NS)),
        })

    fills = []
    fills_node = root.find("m:fills", NS)
    for fill in fills_node if fills_node is not None else ():
        pattern = fill.find("m:patternFill", NS)
        fills.append(color_value(pattern.find("m:fgColor", NS)) if pattern is not None else None)

    border_width = {
        "hair": "0.5px",
        "thin": "1px",
        "medium": "1.5px",
        "thick": "2px",
        "double": "3px",
    }
    borders = []
    borders_node = root.find("m:borders", NS)
    for border in borders_node if borders_node is not None else ():
        parsed = {}
        for side_name in ("left", "right", "top", "bottom"):
            side = border.find(f"m:{side_name}", NS)
            style = side.get("style") if side is not None else None
            if style:
                parsed[side_name] = {
                    "width": border_width.get(style, "1px"),
                    "style": "double" if style == "double" else "solid",
                    "color": color_value(side.find("m:color", NS)) or "#000000",
                }
        borders.append(parsed)

    styles = []
    cell_xfs = root.find("m:cellXfs", NS)
    for xf in cell_xfs if cell_xfs is not None else ():
        alignment = xf.find("m:alignment", NS)
        styles.append({
            "font": fonts[int(xf.get("fontId", "0"))],
            "fill": fills[int(xf.get("fillId", "0"))],
            "border": borders[int(xf.get("borderId", "0"))],
            "align": alignment.get("horizontal") if alignment is not None else None,
            "vertical": alignment.get("vertical") if alignment is not None else None,
            "wrap": alignment is not None and alignment.get("wrapText") == "1",
            "rotation": int(alignment.get("textRotation", "0")) if alignment is not None else 0,
            "numberFormat": int(xf.get("numFmtId", "0")),
        })
    return styles


def parse_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    root = read_xml(archive, "xl/sharedStrings.xml")
    strings = []
    for item in root.findall("m:si", NS):
        strings.append("".join(node.text or "" for node in item.iter() if local_name(node.tag) == "t"))
    return strings


def cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    kind = cell.get("t")
    value = cell.find("m:v", NS)
    if value is None:
        inline = cell.find("m:is", NS)
        if inline is not None:
            return "".join(node.text or "" for node in inline.iter() if local_name(node.tag) == "t")
        return ""
    raw = value.text or ""
    if kind == "s":
        return shared_strings[int(raw)]
    if kind == "b":
        return "TRUE" if raw == "1" else "FALSE"
    return raw


def workbook_sheets(archive: zipfile.ZipFile) -> list[tuple[str, str, tuple[int, int, int, int] | None]]:
    workbook = read_xml(archive, "xl/workbook.xml")
    relationships = read_xml(archive, "xl/_rels/workbook.xml.rels")
    targets = {item.get("Id"): item.get("Target") for item in relationships}
    print_areas = {}
    defined_names = workbook.find("m:definedNames", NS)
    if defined_names is not None:
        for item in defined_names:
            if item.get("name") != "_xlnm.Print_Area" or item.get("localSheetId") is None:
                continue
            range_match = re.search(r"\$([A-Z]+)\$(\d+):\$([A-Z]+)\$(\d+)", item.text or "")
            if range_match:
                print_areas[int(item.get("localSheetId"))] = (
                    int(range_match.group(2)),
                    column_number(range_match.group(1)),
                    int(range_match.group(4)),
                    column_number(range_match.group(3)),
                )
    result = []
    sheets_node = workbook.find("m:sheets", NS)
    for index, sheet in enumerate(sheets_node if sheets_node is not None else ()):
        relationship_id = sheet.get(f"{{{NS['r']}}}id")
        result.append((sheet.get("name"), f"xl/{targets[relationship_id]}", print_areas.get(index)))
    return result


def drawing_images(archive: zipfile.ZipFile, sheet_path: str) -> list[dict]:
    rel_path = sheet_path.replace("worksheets/", "worksheets/_rels/") + ".rels"
    if rel_path not in archive.namelist():
        return []
    sheet_rels = read_xml(archive, rel_path)
    drawing_target = None
    for rel in sheet_rels:
        if rel.get("Type", "").endswith("/drawing"):
            drawing_target = rel.get("Target").replace("../", "xl/")
    if not drawing_target:
        return []

    drawing = read_xml(archive, drawing_target)
    drawing_rel_path = drawing_target.replace("drawings/", "drawings/_rels/") + ".rels"
    drawing_rels = read_xml(archive, drawing_rel_path)
    media_targets = {rel.get("Id"): rel.get("Target").split("/")[-1] for rel in drawing_rels}
    images = []
    for anchor in drawing:
        start = anchor.find("xdr:from", NS)
        blip = anchor.find(".//a:blip", NS)
        if start is None or blip is None:
            continue
        embed = blip.get(f"{{{NS['r']}}}embed")
        images.append({
            "row": int(start.find("xdr:row", NS).text) + 1,
            "col": int(start.find("xdr:col", NS).text) + 1,
            "media": media_targets.get(embed, ""),
        })
    return images


def parse_sheet(
    archive: zipfile.ZipFile,
    name: str,
    path: str,
    print_area: tuple[int, int, int, int] | None,
    shared_strings: list[str],
    styles: list[dict],
) -> dict:
    root = read_xml(archive, path)
    dimension = root.find("m:dimension", NS).get("ref")
    dimension_start_row, dimension_start_col, dimension_end_row, dimension_end_col = parse_range(dimension)
    start_row, start_col, max_row, max_col = print_area or (
        dimension_start_row,
        dimension_start_col,
        dimension_end_row,
        dimension_end_col,
    )
    all_merge_ranges = []
    merge_cells_node = root.find("m:mergeCells", NS)
    if merge_cells_node is not None:
        all_merge_ranges = [parse_range(item.get("ref")) for item in merge_cells_node]
        for row1, col1, row2, col2 in all_merge_ranges:
            overlaps_print_area = not (
                row2 < start_row or row1 > max_row or col2 < start_col or col1 > max_col
            )
            if overlaps_print_area:
                start_row = min(start_row, row1)
                start_col = min(start_col, col1)
                max_row = max(max_row, row2)
                max_col = max(max_col, col2)
    sheet_format = root.find("m:sheetFormatPr", NS)
    default_row_height = float(sheet_format.get("defaultRowHeight", "15")) if sheet_format is not None else 15

    all_columns = [{"width": 9.140625} for _ in range(max_col)]
    cols = root.find("m:cols", NS)
    if cols is not None:
        for item in cols:
            start = int(item.get("min"))
            end = min(int(item.get("max")), max_col)
            for col in range(start, end + 1):
                all_columns[col - 1] = {"width": float(item.get("width", "9.140625"))}
    columns = all_columns[start_col - 1:max_col]

    row_heights = [default_row_height for _ in range(max_row)]
    hidden_rows = set()
    raw_cells: dict[tuple[int, int], dict] = {}
    sheet_data = root.find("m:sheetData", NS)
    if sheet_data is not None:
        for row in sheet_data:
            row_number = int(row.get("r"))
            if row_number < start_row or row_number > max_row:
                continue
            if row.get("ht"):
                row_heights[row_number - 1] = float(row.get("ht"))
            if row.get("hidden") == "1":
                hidden_rows.add(row_number)
            for cell in row.findall("m:c", NS):
                cell_row, cell_col = split_ref(cell.get("r"))
                if cell_col < start_col or cell_col > max_col:
                    continue
                raw_cells[(cell_row, cell_col)] = {
                    "ref": cell.get("r"),
                    "value": cell_value(cell, shared_strings),
                    "style": int(cell.get("s", "0")),
                }

    merges = []
    for row1, col1, row2, col2 in all_merge_ranges:
        if row1 >= start_row and col1 >= start_col and row2 <= max_row and col2 <= max_col:
            merges.append((row1, col1, row2, col2))

    covered = set()
    merge_at = {}
    for row1, col1, row2, col2 in merges:
        merge_at[(row1, col1)] = (row2 - row1 + 1, col2 - col1 + 1)
        for row in range(row1, row2 + 1):
            for col in range(col1, col2 + 1):
                if (row, col) != (row1, col1):
                    covered.add((row, col))

    images = drawing_images(archive, path)

    def image_target(image: dict) -> tuple[int, int]:
        for row1, col1, row2, col2 in merges:
            if row1 <= image["row"] <= row2 and col1 <= image["col"] <= col2:
                return row1, col1
        return image["row"], image["col"]

    image_cells = {}
    for image in images:
        target = image_target(image)
        image_cells.setdefault(target, []).append(
            "stamp" if image["media"].lower() == "image2.png" else "logo"
        )

    rows = []
    for row_number in range(start_row, max_row + 1):
        if row_number in hidden_rows:
            continue
        cells = []
        for col_number in range(start_col, max_col + 1):
            if (row_number, col_number) in covered:
                continue
            raw = raw_cells.get((row_number, col_number), {
                "ref": f"{column_letters(col_number)}{row_number}",
                "value": "",
                "style": 0,
            })
            rowspan, colspan = merge_at.get((row_number, col_number), (1, 1))
            cell = {
                **raw,
                "rowspan": rowspan,
                "colspan": colspan,
            }
            if rowspan > 1 or colspan > 1:
                row2 = row_number + rowspan - 1
                col2 = col_number + colspan - 1
                merge_border = {}
                perimeter = {
                    "top": [(row_number, col) for col in range(col_number, col2 + 1)],
                    "right": [(row, col2) for row in range(row_number, row2 + 1)],
                    "bottom": [(row2, col) for col in range(col_number, col2 + 1)],
                    "left": [(row, col_number) for row in range(row_number, row2 + 1)],
                }
                for side, refs in perimeter.items():
                    for ref in refs:
                        style_index = raw_cells.get(ref, {}).get("style", raw["style"])
                        border = styles[style_index]["border"].get(side)
                        if border:
                            merge_border[side] = border
                            break
                if merge_border:
                    cell["mergeBorder"] = merge_border
            if (row_number, col_number) in image_cells:
                cell["images"] = image_cells[(row_number, col_number)]
            cells.append(cell)
        rows.append({"number": row_number, "height": row_heights[row_number - 1], "cells": cells})

    page_setup = root.find("m:pageSetup", NS)
    page_margins = root.find("m:pageMargins", NS)
    title = next(
        (
            cell["value"]
            for row in rows
            for cell in row["cells"]
            if "Preventive Maintenance Report" in cell["value"]
        ),
        name,
    )
    return {
        "sheet": name,
        "title": title,
        "maxCol": max_col - start_col + 1,
        "columns": columns,
        "rows": rows,
        "page": {
            "orientation": page_setup.get("orientation", "portrait") if page_setup is not None else "portrait",
            "scale": int(page_setup.get("scale", "100")) if page_setup is not None else 100,
            "margins": {
                key: float(page_margins.get(key, "0"))
                for key in ("left", "right", "top", "bottom")
            } if page_margins is not None else {},
        },
    }


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: extract-report-workbook.py INPUT.xlsx OUTPUT.js")
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    with zipfile.ZipFile(source) as archive:
        shared_strings = parse_shared_strings(archive)
        styles = parse_styles(archive)
        templates = [
            parse_sheet(archive, name, path, print_area, shared_strings, styles)
            for name, path, print_area in workbook_sheets(archive)
        ]

    aliases = {
        "Fire Aalrm System": ["Fire Alarm System", "Fire Alarm"],
        "Fire Extinguisher": ["Fire Extinguishers", "Fire Extinguisher"],
        "PA SYSTEM": ["Public Announcement System", "Public Annoucment System", "Public Address System", "PA System", "PA"],
        "CCTV System": ["CCTV System", "CCTV"],
        "Access Control": ["Access Control System", "Access Control"],
        "Fire Sprinkler": ["Fire Sprinkler System", "Fire Sprinkler", "Sprinkler System"],
        "Novec": ["FM 200 System", "FM200 System", "FM-200 System", "Gas Suppression System", "Gas Supression System", "Novec System", "Novec"],
        "Vesda": ["Very Early Smoke Detection Apparator", "Very Early Smoke Detection Apparatus", "VESDA System", "Vesda", "VESDA"],
        "Rodent": ["Rodent Repellent System", "Rodent"],
        "WLD": ["Water Leak System", "Water Leak Detection System", "WLD"],
    }
    payload = json.dumps(templates, indent=2, ensure_ascii=False)
    styles_payload = json.dumps(styles, indent=2, ensure_ascii=False)
    alias_payload = json.dumps(aliases, indent=2, ensure_ascii=False)
    output.write_text(
        f"""// Generated from DVIT Floor PPM REPORT Main file.xlsx.
// Run scripts/extract-report-workbook.py to refresh this file from the workbook.
export const reportStyles = {styles_payload};

export const reportTemplates = {payload};

const serviceTemplateAliases = {alias_payload};

export function getReportTemplate(serviceName = "") {{
  const normalized = serviceName.trim().toLowerCase();
  const aliasEntries = reportTemplates.map((template) => ({{
    template,
    aliases: serviceTemplateAliases[template.sheet] || [template.sheet],
  }}));
  const exact = aliasEntries.find(({{ aliases }}) =>
    aliases.some((alias) => alias.toLowerCase() === normalized)
  );
  if (exact) return exact.template;

  const found = aliasEntries.find(({{ aliases }}) =>
    aliases.some((alias) => {{
      const candidate = alias.toLowerCase();
      return candidate.length >= 4 && (normalized.includes(candidate) || candidate.includes(normalized));
    }})
  );
  return found?.template || reportTemplates[0];
}}
""",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
