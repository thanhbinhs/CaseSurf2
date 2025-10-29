export GOOGLE_API_KEY="AIzaSyAggzXL52RqMguNlb9VF2HpFVDvsGSOmEg"

nohup gunicorn main:app \
  --workers 10 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8001 \
  --backlog 2048 \
  --timeout 60 > output.log 2>&1 &
echo $! > nohup.pid