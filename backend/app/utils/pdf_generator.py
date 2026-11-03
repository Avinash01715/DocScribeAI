# backend/app/utils/pdf_generator.py
import uuid
from pathlib import Path
from fpdf import FPDF
from app.schemas.prescription import PrescriptionExtractionResponse

BASE_DIR = Path(__file__).resolve().parent.parent
PDF_OUTPUT_DIR = BASE_DIR / "data" / "pdf_prescriptions"
PDF_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

class ClinicalPrescriptionPDF(FPDF):
    def header(self):
        # Deep Slate header banner
        self.set_fill_color(15, 23, 42)
        self.rect(0, 0, 210, 25, 'F')
        self.set_text_color(255, 255, 255)
        self.set_font("Helvetica", "B", 15)
        self.cell(0, 10, "DHANVANTARI CLINIC & OPD CARE", ln=True, align="C")
        self.set_font("Helvetica", "", 9)
        self.cell(0, 5, "Ayushman Bharat Digital Mission (ABDM) Compliant Partner", ln=True, align="C")
        self.ln(12)

    def footer(self):
        self.set_y(-20)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(100, 116, 139)
        self.cell(0, 5, "Digitally transcribed via DhanvantariVoice Ambient Copilot - Validated by Clinician", ln=True, align="C")
        self.cell(0, 5, f"Page {self.page_no()}", align="C")

def generate_prescription_pdf(data: PrescriptionExtractionResponse, doctor_name: str = "Dr. Sharma, MBBS, MD") -> str:
    pdf = ClinicalPrescriptionPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)

    # Doctor and Date Details
    pdf.set_text_color(15, 23, 42)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(100, 6, doctor_name, ln=False)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, "Date: 03-Nov-2026", ln=True, align="R")

    # Patient Card Box
    pdf.set_fill_color(241, 245, 249)
    pdf.rect(10, 38, 190, 18, 'F')
    pdf.set_y(40)
    pdf.set_x(12)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(30, 6, "Patient Name:", ln=False)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(60, 6, data.patient_info.name, ln=False)

    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(25, 6, "Diagnosis:", ln=False)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, data.clinical_findings.diagnosis, ln=True)

    # Chief Complaints
    pdf.ln(10)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(40, 6, "Chief Complaints:", ln=False)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, ", ".join(data.patient_info.chief_complaints), ln=True)
    pdf.ln(4)

    # Table Header (Medical Teal)
    pdf.set_fill_color(13, 148, 136)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(65, 8, " Medicine Name", 1, 0, 'L', fill=True)
    pdf.cell(30, 8, "Dosage", 1, 0, 'C', fill=True)
    pdf.cell(30, 8, "Frequency", 1, 0, 'C', fill=True)
    pdf.cell(35, 8, "Timing", 1, 0, 'C', fill=True)
    pdf.cell(30, 8, "Duration", 1, 1, 'C', fill=True)

    # Table Content
    pdf.set_text_color(15, 23, 42)
    pdf.set_font("Helvetica", "", 9)
    for med in data.prescription:
        pdf.cell(65, 8, f" {med.verified_match or med.drug_name}", 1, 0, 'L')
        pdf.cell(30, 8, med.dosage, 1, 0, 'C')
        pdf.cell(30, 8, med.frequency, 1, 0, 'C')
        pdf.cell(35, 8, med.timing, 1, 0, 'C')
        pdf.cell(30, 8, med.duration, 1, 1, 'C')

    # Advice Section
    if data.advice:
        pdf.ln(6)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 6, "General Advice / Parhez:", ln=True)
        pdf.set_font("Helvetica", "", 9)
        pdf.multi_cell(0, 5, data.advice)

    # Doctor Signature Line
    pdf.ln(12)
    pdf.set_x(140)
    pdf.line(140, pdf.get_y(), 195, pdf.get_y())
    pdf.set_font("Helvetica", "I", 9)
    pdf.cell(0, 6, "Doctor's Signature", ln=True, align="R")

    filename = f"prescription_{uuid.uuid4().hex[:8]}.pdf"
    file_path = PDF_OUTPUT_DIR / filename
    pdf.output(str(file_path))
    return str(file_path)