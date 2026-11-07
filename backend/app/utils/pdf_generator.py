# backend/app/utils/pdf_generator.py
import uuid
import re
from pathlib import Path
from typing import Any, Optional
from fpdf import FPDF
from app.utils.hinglish import devanagari_to_hinglish

BASE_DIR = Path(__file__).resolve().parent.parent
PDF_OUTPUT_DIR = BASE_DIR / "data" / "pdf_prescriptions"
PDF_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def safe_str(val: Any) -> str:
    """Sanitizes text by converting Devanagari to Hinglish and encoding cleanly for FPDF."""
    if val is None:
        return ""
    text = str(val).strip()
    text = devanagari_to_hinglish(text)
    return text.encode("latin-1", "replace").decode("latin-1")


class ClinicalPrescriptionPDF(FPDF):
    def __init__(self, font_name="Helvetica", *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.font_name = font_name

    def header(self):
        # Deep Slate header banner
        self.set_fill_color(15, 23, 42)
        self.rect(0, 0, 210, 25, 'F')
        self.set_text_color(255, 255, 255)
        self.set_font(self.font_name, "B", 15)
        self.cell(0, 10, "DHANVANTARI CLINIC & OPD CARE", ln=True, align="C")
        self.set_font(self.font_name, "", 9)
        self.cell(0, 5, "Ayushman Bharat Digital Mission (ABDM) Compliant Partner", ln=True, align="C")
        self.ln(12)

    def footer(self):
        self.set_y(-20)
        self.set_font(self.font_name, "I", 8)
        self.set_text_color(100, 116, 139)
        self.cell(0, 5, "Digitally transcribed via DhanvantariVoice Ambient Copilot - Validated by Clinician", ln=True, align="C")
        self.cell(0, 5, f"Page {self.page_no()}", align="C")


def _get_val(obj: Any, key: str, default: Any = None) -> Any:
    """Extracts values whether obj is a Pydantic model, an object, or a dict."""
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def generate_prescription_pdf(
    data: Any = None,
    doctor_name: str = "Dr. Sharma, MBBS, MD",
    patient_info: Any = None,
    clinical_findings: Any = None,
    prescription: Any = None,
    advice: Optional[str] = None,
    filename_suffix: Optional[str] = None,
    **kwargs
) -> str:
    """
    Generates a standardized clinical prescription PDF.
    Accepts either a unified `data` object or discrete kwargs.
    Returns only the generated filename (e.g. 'prescription_xyz.pdf').
    """
    # Normalize input fields across call signatures
    p_info = patient_info if patient_info is not None else _get_val(data, "patient_info", {})
    c_findings = clinical_findings if clinical_findings is not None else _get_val(data, "clinical_findings", {})
    rx_items = prescription if prescription is not None else _get_val(data, "prescription", [])
    adv = advice if advice is not None else _get_val(data, "advice", "")

    patient_name = _get_val(p_info, "name", "Patient")
    diagnosis = _get_val(c_findings, "diagnosis", "Clinical Assessment")
    complaints = _get_val(p_info, "chief_complaints", [])

    pdf = ClinicalPrescriptionPDF(font_name="Helvetica")

    # Windows font fallback for broader typography support
    arial_path = Path("C:/Windows/Fonts/Arial.ttf")
    arial_bold = Path("C:/Windows/Fonts/arialbd.ttf")
    arial_italic = Path("C:/Windows/Fonts/ariali.ttf")
    if arial_path.exists():
        try:
            pdf.add_font("ArialUni", "", str(arial_path))
            if arial_bold.exists():
                pdf.add_font("ArialUni", "B", str(arial_bold))
            if arial_italic.exists():
                pdf.add_font("ArialUni", "I", str(arial_italic))
            pdf.font_name = "ArialUni"
        except Exception:
            pdf.font_name = "Helvetica"

    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)
    fn = pdf.font_name

    # Doctor and Date Details
    pdf.set_text_color(15, 23, 42)
    pdf.set_font(fn, "B", 11)
    pdf.cell(100, 6, safe_str(doctor_name), ln=False)
    pdf.set_font(fn, "", 10)
    pdf.cell(0, 6, "Date: 07-Nov-2026", ln=True, align="R")

    # Patient Card Box
    pdf.set_fill_color(241, 245, 249)
    pdf.rect(10, 38, 190, 18, 'F')
    pdf.set_y(40)
    pdf.set_x(12)
    pdf.set_font(fn, "B", 10)
    pdf.cell(30, 6, "Patient Name:", ln=False)
    pdf.set_font(fn, "", 10)
    pdf.cell(60, 6, safe_str(patient_name), ln=False)

    pdf.set_font(fn, "B", 10)
    pdf.cell(25, 6, "Diagnosis:", ln=False)
    pdf.set_font(fn, "", 10)
    pdf.cell(0, 6, safe_str(diagnosis), ln=True)

    # Chief Complaints
    pdf.ln(10)
    pdf.set_font(fn, "B", 10)
    pdf.cell(40, 6, "Chief Complaints:", ln=False)
    pdf.set_font(fn, "", 10)
    complaints_str = safe_str(", ".join([safe_str(c) for c in complaints])) if complaints else "None Reported"
    pdf.cell(0, 6, complaints_str, ln=True)
    pdf.ln(4)

    # Table Header (Medical Teal)
    pdf.set_fill_color(13, 148, 136)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font(fn, "B", 9)
    pdf.cell(65, 8, " Medicine Name", 1, 0, 'L', fill=True)
    pdf.cell(30, 8, "Dosage", 1, 0, 'C', fill=True)
    pdf.cell(30, 8, "Frequency", 1, 0, 'C', fill=True)
    pdf.cell(35, 8, "Timing", 1, 0, 'C', fill=True)
    pdf.cell(30, 8, "Duration", 1, 1, 'C', fill=True)

    # Table Content
    pdf.set_text_color(15, 23, 42)
    pdf.set_font(fn, "", 9)
    for med in rx_items:
        verified_match = _get_val(med, "verified_match")
        raw_drug_name = _get_val(med, "drug_name", "Medicine")
        drug_name = safe_str(verified_match or raw_drug_name)

        dosage = safe_str(_get_val(med, "dosage", ""))
        frequency = safe_str(_get_val(med, "frequency", ""))
        timing = safe_str(_get_val(med, "timing", ""))
        duration = safe_str(_get_val(med, "duration", ""))

        pdf.cell(65, 8, f" {drug_name}", 1, 0, 'L')
        pdf.cell(30, 8, dosage, 1, 0, 'C')
        pdf.cell(30, 8, frequency, 1, 0, 'C')
        pdf.cell(35, 8, timing, 1, 0, 'C')
        pdf.cell(30, 8, duration, 1, 1, 'C')

    # Advice Section
    if adv:
        pdf.ln(6)
        pdf.set_font(fn, "B", 10)
        pdf.cell(0, 6, "General Advice / Parhez:", ln=True)
        pdf.set_font(fn, "", 9)
        pdf.multi_cell(0, 5, safe_str(adv))

    # Doctor Signature Line
    pdf.ln(12)
    pdf.set_x(140)
    pdf.line(140, pdf.get_y(), 195, pdf.get_y())
    pdf.set_font(fn, "I", 9)
    pdf.cell(0, 6, "Doctor's Signature", ln=True, align="R")

    # Generate filename and write to disk
    if filename_suffix:
        clean_suffix = re.sub(r"[^\w\-]", "_", filename_suffix)
        filename = f"prescription_{clean_suffix}.pdf"
    else:
        filename = f"prescription_{uuid.uuid4().hex[:8]}.pdf"

    file_path = PDF_OUTPUT_DIR / filename
    pdf.output(str(file_path))

    # Return only the filename so static URL formatting remains clean
    return filename