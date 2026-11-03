FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HOME=/tmp \
    TMPDIR=/tmp

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./requirements.txt

RUN python -m pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN groupadd --system --gid 10001 omr \
    && useradd --system --uid 10001 --gid omr \
       --home-dir /tmp --no-create-home omr

USER 10001:10001

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
