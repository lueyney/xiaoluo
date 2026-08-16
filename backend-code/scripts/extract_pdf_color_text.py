import json
import sys

import pdfplumber


def color_kind(char):
    color = char.get("non_stroking_color")
    if not isinstance(color, (list, tuple)) or len(color) < 3:
        return None
    red, green, blue = color[:3]
    # The reports currently use RGB(234, 0, 46) for severe suspicion and a
    # separate amber RGB for mild suspicion. Keep this deliberately broad so
    # nearby report themes and anti-aliased export values are accepted.
    if red >= 0.80 and green <= 0.12 and blue <= 0.28:
        return "red"
    if red >= 0.80 and 0.45 <= green <= 0.90 and blue <= 0.65:
        return "yellow"
    return None


def extract(path):
    red_segments = []
    yellow_segments = []
    text_lines = []
    red_chars = 0
    yellow_chars = 0
    with pdfplumber.open(path) as report:
        for page_number, page in enumerate(report.pages, 1):
            colored_lines = {}
            all_lines = {}
            for char in page.chars:
                kind = color_kind(char)
                matrix = char.get("matrix") or ()
                rotated_watermark = len(matrix) >= 4 and (
                    abs(float(matrix[1])) > 1e-6
                    and abs(float(matrix[2])) > 1e-6
                    and float(char.get("size", 0.0)) >= 20.0
                )
                # pdfplumber's `top` is stable for a rendered text line. The
                # small bucket absorbs tiny glyph-baseline differences.
                line_key = round(float(char.get("top", 0.0)) / 2.0) * 2.0
                # Diagonal report watermarks otherwise interrupt body
                # sentences in the reading stream. Coloured rotated text is
                # retained because it is part of the report's marked content.
                if not rotated_watermark or kind:
                    all_lines.setdefault(line_key, []).append((char, kind))
                if not kind:
                    continue
                colored_lines.setdefault((line_key, kind), []).append(char)
                if kind == "red":
                    red_chars += 1
                else:
                    yellow_chars += 1

            # Keep a lossless-enough text-layer stream with colour runs. The
            # Node matcher uses this full stream to distinguish repeated DOCX
            # sentences: an unmarked first occurrence must not consume the
            # later occurrence that is actually red.
            for line_key, chars_with_kind in sorted(all_lines.items(), key=lambda item: item[0]):
                chars_with_kind.sort(key=lambda item: (
                    float(item[0].get("x0", 0.0)),
                    float(item[0].get("x1", 0.0)),
                ))
                runs = []
                for char, kind in chars_with_kind:
                    value = char.get("text", "")
                    if not value:
                        continue
                    if runs and runs[-1]["kind"] == kind:
                        runs[-1]["text"] += value
                    else:
                        runs.append({"kind": kind, "text": value})
                text = "".join(run["text"] for run in runs)
                if text.strip():
                    text_lines.append({
                        "page": page_number,
                        "top": line_key,
                        "text": text,
                        "runs": runs,
                    })

            for (line_key, kind), chars in sorted(colored_lines.items(), key=lambda item: (item[0][0], item[0][1])):
                chars.sort(key=lambda char: (float(char.get("x0", 0.0)), float(char.get("x1", 0.0))))
                text = "".join(char.get("text", "") for char in chars)
                if not text.strip():
                    continue
                item = {"page": page_number, "top": line_key, "text": text, "charCount": len(chars)}
                if kind == "red":
                    red_segments.append(item)
                else:
                    yellow_segments.append(item)
    payload = {
        "redSegments": red_segments,
        "yellowSegments": yellow_segments,
        "textLines": text_lines,
        "redChars": red_chars,
        "yellowChars": yellow_chars,
    }
    return payload


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        raise SystemExit("usage: extract_pdf_color_text.py REPORT.pdf [OUTPUT.json]")
    payload = extract(sys.argv[1])
    encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    if len(sys.argv) == 3:
        with open(sys.argv[2], "wb") as output:
            output.write(encoded)
    else:
        sys.stdout.buffer.write(encoded)
        sys.stdout.buffer.write(b"\n")
