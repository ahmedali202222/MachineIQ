FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY machine_model.py server.py ./
EXPOSE 4840 8090
CMD ["python", "server.py"]
