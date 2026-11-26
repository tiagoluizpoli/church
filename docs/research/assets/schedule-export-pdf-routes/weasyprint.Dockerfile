# Throwaway benchmark image: WeasyPrint 70 on Debian slim.
FROM python:3.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir weasyprint==70.0
WORKDIR /w
