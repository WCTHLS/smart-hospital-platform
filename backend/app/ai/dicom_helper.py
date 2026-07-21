"""DICOM (.dcm) Medical Imaging Helper.

Reads DICOM tags (Modality, Patient ID, Body Part, Study Date) and converts
16-bit radiology grayscale pixel matrices into web-renderable PNG previews.
"""
from __future__ import annotations

import os
from typing import Any


def process_dicom_file(file_path: str, output_dir: str = "uploads") -> dict[str, Any]:
    """Process a DICOM file.

    Extracts DICOM tags and converts the raw pixel matrix to a JPEG/PNG image preview.
    If the file is already a standard image (JPEG/PNG), returns image metadata.
    """
    os.makedirs(output_dir, exist_ok=True)
    ext = os.path.splitext(file_path)[1].lower()

    # Default result structure
    result: dict[str, Any] = {
        "is_dicom": False,
        "modality": "X-RAY",
        "body_part": "CHEST",
        "study_date": None,
        "preview_uri": None,
        "metadata": {},
    }

    if ext in [".jpg", ".jpeg", ".png", ".webp"]:
        result["preview_uri"] = f"/{file_path.replace('\\\\', '/').lstrip('/')}"
        return result

    if ext not in [".dcm", ".dicom"]:
        # Standard file fallback
        result["preview_uri"] = f"/{file_path.replace('\\\\', '/').lstrip('/')}"
        return result

    try:
        import pydicom
        from PIL import Image
        import numpy as np

        ds = pydicom.dcmread(file_path)
        result["is_dicom"] = True
        result["modality"] = str(getattr(ds, "Modality", "DX"))
        result["body_part"] = str(getattr(ds, "BodyPartExamined", "CHEST"))
        result["study_date"] = str(getattr(ds, "StudyDate", ""))

        result["metadata"] = {
            "PatientName": str(getattr(ds, "PatientName", "Anonymous")),
            "PatientID": str(getattr(ds, "PatientID", "N/A")),
            "Modality": result["modality"],
            "BodyPartExamined": result["body_part"],
            "Manufacturer": str(getattr(ds, "Manufacturer", "Hospital Scanner")),
            "StudyDate": result["study_date"],
        }

        # Convert 16-bit DICOM pixel array to 8-bit preview image
        if hasattr(ds, "pixel_array"):
            pixels = ds.pixel_array.astype(float)
            
            # Rescale pixel intensities to 0-255 range
            min_val = np.min(pixels)
            max_val = np.max(pixels)
            if max_val > min_val:
                pixels = (pixels - min_val) / (max_val - min_val) * 255.0
            else:
                pixels = np.zeros_like(pixels)
                
            img_array = pixels.astype(np.uint8)
            img = Image.fromarray(img_array)

            base_name = os.path.basename(file_path)
            preview_filename = f"preview_{os.path.splitext(base_name)[0]}.png"
            preview_path = os.path.join(output_dir, preview_filename)
            img.save(preview_path, format="PNG")

            result["preview_uri"] = f"/uploads/{preview_filename}"
    except Exception as exc:
        print(f"[DICOM Helper] Exception reading DICOM {file_path}: {exc}")
        result["preview_uri"] = f"/{file_path.replace('\\\\', '/').lstrip('/')}"

    return result
