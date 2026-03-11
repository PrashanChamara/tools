import io
import base64
import numpy as np
import pandas as pd
import cv2
from flask import Flask, render_template, request, send_file
from docx import Document
from rembg import remove
from PIL import Image
from PyPDF2 import PdfReader, PdfWriter
from pdf2image import convert_from_bytes
import os

app = Flask(__name__)

# ===== Image Upscaling Setup =====
UPSCALE_MODEL_PATH = "models/EDSR_x4.pb"

def upscale_image_with_model(image_path):
    """
    Upscales an image using a pre-trained EDSR model from OpenCV.
    """
    sr = cv2.dnn_superres.DnnSuperResImpl_create()
    sr.readModel(UPSCALE_MODEL_PATH)
    sr.setModel("edsr", 4)
    image = cv2.imread(image_path)
    result = sr.upsample(image)
    return result

# ===== Existing Routes (Unchanged) =====

@app.route('/')
def home():
    """Landing page showing tool options."""
    return render_template('index.html')

@app.route('/speech_to_text')
def speech_to_text():
    """Speech-to-text page."""
    return render_template('speech_to_text.html')

@app.route('/download', methods=['POST'])
def download():
    text = request.form.get('text', '')
    doc = Document()
    doc.add_paragraph(text)
    file_stream = io.BytesIO()
    doc.save(file_stream)
    file_stream.seek(0)
    return send_file(
        file_stream,
        as_attachment=True,
        download_name="transcription.docx",
        mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )

@app.route('/remove_background')
def remove_background():
    """Background removal page."""
    return render_template('remove_background.html')

@app.route('/remove_bg', methods=['POST'])
def remove_bg():
    file = request.files.get('image')
    if not file:
        return "No file uploaded", 400
    input_image = Image.open(file).convert("RGBA")
    output_image = remove(input_image)
    output_stream = io.BytesIO()
    output_image.save(output_stream, format="PNG")
    output_stream.seek(0)
    return send_file(
        output_stream,
        as_attachment=True,
        download_name="no_bg.png",
        mimetype="image/png"
    )

@app.route('/sketch')
def sketch():
    """Sketching tool page."""
    return render_template('sketch.html')

@app.route('/sketch_image', methods=['POST'])
def sketch_image():
    file = request.files.get('image')
    if not file:
        return "No file uploaded", 400
    file_bytes = np.asarray(bytearray(file.read()), dtype=np.uint8)
    img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
    if img is None:
        return "Invalid image", 400
    gray_img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    inverted_img = cv2.bitwise_not(gray_img)
    blurred = cv2.GaussianBlur(inverted_img, (21, 21), sigmaX=0, sigmaY=0)
    inverted_blur = cv2.bitwise_not(blurred)
    sketch_img = cv2.divide(gray_img, inverted_blur, scale=256.0)
    success, buffer = cv2.imencode('.png', sketch_img)
    if not success:
        return "Image processing failed", 500
    output_stream = io.BytesIO(buffer)
    output_stream.seek(0)
    return send_file(
        output_stream,
        as_attachment=True,
        download_name="sketch.png",
        mimetype="image/png"
    )

@app.route('/excel_tool', methods=['GET', 'POST'])
def excel_tool():
    if request.method == 'GET':
        return render_template('excel_tool.html')
    else:
        file_a = request.files.get('file_a')
        file_b = request.files.get('file_b')
        if not file_a or not file_b:
            return "Both files are required", 400
        file_a_data = file_a.read()
        file_b_data = file_b.read()
        df_a = pd.read_excel(io.BytesIO(file_a_data))
        df_b = pd.read_excel(io.BytesIO(file_b_data))
        cols_a = list(df_a.columns)
        cols_b = list(df_b.columns)
        common_cols = list(set(cols_a).intersection(set(cols_b)))
        file_a_b64 = base64.b64encode(file_a_data).decode('utf-8')
        file_b_b64 = base64.b64encode(file_b_data).decode('utf-8')
        return render_template('excel_tool_options.html',
                               common_cols=common_cols,
                               cols_a=cols_a,
                               cols_b=cols_b,
                               file_a_b64=file_a_b64,
                               file_b_b64=file_b_b64)

@app.route('/process_excel', methods=['POST'])
def process_excel():
    common_col = request.form.get('common_col')
    copy_from = request.form.get('copy_from')
    selected_cols = request.form.getlist('selected_cols')
    file_a_b64 = request.form.get('file_a_b64')
    file_b_b64 = request.form.get('file_b_b64')
    if not all([common_col, copy_from, file_a_b64, file_b_b64]):
        return "Missing data", 400
    file_a_data = base64.b64decode(file_a_b64)
    file_b_data = base64.b64decode(file_b_b64)
    df_a = pd.read_excel(io.BytesIO(file_a_data))
    df_b = pd.read_excel(io.BytesIO(file_b_data))
    if copy_from == 'A':
        copy_df = df_a
        base_df = df_b
    else:
        copy_df = df_b
        base_df = df_a
    copy_subset = copy_df[[common_col] + selected_cols]
    result = base_df.merge(copy_subset, on=common_col, how='left')
    output_stream = io.BytesIO()
    result.to_excel(output_stream, index=False)
    output_stream.seek(0)
    return send_file(
        output_stream,
        as_attachment=True,
        download_name="merged.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

@app.route('/pdf_tool', methods=['GET', 'POST'])
def pdf_tool():
    if request.method == 'GET':
        return render_template('pdf_tool.html')
    else:
        files = request.files.getlist('pdf_files')
        if not files:
            return "No PDF files uploaded", 400
        pdf_data = [file.read() for file in files]
        operation = request.form.get('operation')
        size_option = request.form.get('size_option')
        rotate_option = request.form.get('rotate_option')
        output_file = None
        if operation == 'merge':
            writer = PdfWriter()
            for data in pdf_data:
                reader = PdfReader(io.BytesIO(data))
                for page in reader.pages:
                    writer.add_page(page)
            output_stream = io.BytesIO()
            writer.write(output_stream)
            output_stream.seek(0)
            output_file = output_stream
        elif operation == 'split':
            reader = PdfReader(io.BytesIO(pdf_data[0]))
            writer = PdfWriter()
            if reader.pages:
                writer.add_page(reader.pages[0])
            output_stream = io.BytesIO()
            writer.write(output_stream)
            output_stream.seek(0)
            output_file = output_stream
        elif operation == 'arrange':
            output_file = io.BytesIO(pdf_data[0])
        elif operation == 'pdf_to_jpg':
            images = convert_from_bytes(pdf_data[0])
            if images:
                img_io = io.BytesIO()
                images[0].save(img_io, 'JPEG')
                img_io.seek(0)
                return send_file(img_io, as_attachment=True, download_name="converted.jpg", mimetype="image/jpeg")
            else:
                return "Conversion failed", 500
        elif operation == 'pdf_to_excel':
            output_file = io.BytesIO(pdf_data[0])
        elif operation == 'pdf_to_word':
            output_file = io.BytesIO(pdf_data[0])
        else:
            return "Invalid operation", 400
        if rotate_option:
            try:
                angle = int(rotate_option)
            except ValueError:
                angle = 0
            if angle != 0:
                reader = PdfReader(output_file)
                writer = PdfWriter()
                for page in reader.pages:
                    page.rotate(angle)
                    writer.add_page(page)
                new_output = io.BytesIO()
                writer.write(new_output)
                new_output.seek(0)
                output_file = new_output
        download_name = "result.pdf"
        if operation == 'pdf_to_excel':
            download_name = "result.xlsx"
        elif operation == 'pdf_to_word':
            download_name = "result.docx"
        return send_file(
            output_file,
            as_attachment=True,
            download_name=download_name,
            mimetype="application/pdf"
        )

# ===== Color Correction Routes =====

@app.route('/color_correction')
def color_correction():
    """Color Correction tool page."""
    return render_template('color_correction.html')

@app.route('/process_color_correction', methods=['POST'])
def process_color_correction():
    file = request.files.get('image')
    mode = request.form.get('mode')
    if not file:
        return "No file uploaded", 400
    file_bytes = np.asarray(bytearray(file.read()), dtype=np.uint8)
    img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
    if img is None:
        return "Invalid image", 400
    corrected_img = None
    if mode == 'day':
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        cl = clahe.apply(l)
        corrected_lab = cv2.merge((cl, a, b))
        corrected_img = cv2.cvtColor(corrected_lab, cv2.COLOR_LAB2BGR)
    elif mode == 'night':
        gamma = 1.5
        lookUpTable = np.empty((1, 256), np.uint8)
        for i in range(256):
            lookUpTable[0, i] = np.clip(pow(i / 255.0, 1.0 / gamma) * 255.0, 0, 255)
        corrected_img = cv2.LUT(img, lookUpTable)
    else:
        return "Invalid mode selected", 400
    success, buffer = cv2.imencode('.png', corrected_img)
    if not success:
        return "Image processing failed", 500
    output_stream = io.BytesIO(buffer)
    output_stream.seek(0)
    return send_file(
        output_stream,
        as_attachment=True,
        download_name="color_corrected.png",
        mimetype="image/png"
    )

# ===== Image Upscaling Routes =====

@app.route('/image_upscaling')
def image_upscaling():
    """Image Upscaling tool page."""
    return render_template('image_upscaling.html')

@app.route('/process_upscaling', methods=['POST'])
def process_upscaling():
    file = request.files.get('image')
    if not file:
        return "No file uploaded", 400

    temp_filename = "temp_for_upscaling.png"
    file.save(temp_filename)

    # === NEW: SAFEGUARD ===
    # Read the image to check its dimensions
    img_for_check = cv2.imread(temp_filename)
    if img_for_check is None:
        os.remove(temp_filename)
        return "Invalid image file.", 400

    height, width, _ = img_for_check.shape
    # Set a limit, e.g., 1 million pixels (1000x1000)
    MAX_PIXELS = 1000 * 1000
    if height * width > MAX_PIXELS:
        os.remove(temp_filename)
        # Return a specific error for large files
        error_message = f"Image is too large ({width}x{height}). Please use an image smaller than {MAX_PIXELS / 1000000:.1f} megapixels."
        return error_message, 413 # 413 is the status code for "Payload Too Large"

    # Check if the model file exists
    if not os.path.exists(UPSCALE_MODEL_PATH):
        os.remove(temp_filename)
        return "Upscaling model not found on the server. Please contact the administrator.", 500
        
    try:
        upscaled_image = upscale_image_with_model(temp_filename)
        os.remove(temp_filename)
        success, buffer = cv2.imencode('.png', upscaled_image)
        if not success:
            return "Image processing failed", 500
        output_stream = io.BytesIO(buffer)
        output_stream.seek(0)
        return send_file(
            output_stream,
            as_attachment=True,
            download_name="upscaled_image.png",
            mimetype="image/png"
        )
    except Exception as e:
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
        print(f"An error occurred during upscaling: {e}")
        return "An error occurred during the upscaling process.", 500

if __name__ == '__main__':
    app.run(debug=True)