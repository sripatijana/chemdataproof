# Hugging Face Space (Docker SDK) or any Docker host.
FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH PYTHONUNBUFFERED=1
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Download the model weights at build time so the first request is fast.
RUN python -c "from huggingface_hub import hf_hub_download; hf_hub_download('yujieq/MolScribe', 'swin_base_char_aux_1m680k.pth')"

COPY --chown=user app.py engines.py ./
EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
