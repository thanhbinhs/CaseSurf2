import time
from google import genai
from google.genai import types

# --- BƯỚC 1: KHỞI TẠO VÀ CẤU HÌNH ---
print("1. Khởi tạo Client và kiểm tra API Key...")
# genai.Client() sẽ tự động tìm kiếm API Key trong biến môi trường GEMINI_API_KEY
client = genai.Client()

prompt = """A person, mid-shot, struggling to move, as if wading through thick, invisible liquid, movements are exaggeratedly slow and effortful, with a slight digital distortion effect.'"""
print(f"   => Prompt sử dụng: \"{prompt[:80]}...\"")

# --- BƯỚC 2: GỬI YÊU CẦU TẠO VIDEO ---
print("2. Gửi yêu cầu tạo video Veo (veo-3.0-fast-generate-001)...")
operation = client.models.generate_videos(
    model="veo-3.0-fast-generate-001",
    prompt=prompt,
)
print(f"   => Yêu cầu đã được gửi. Operation ID: {operation.name}")

# --- BƯỚC 3: KIỂM TRA TRẠNG THÁI (Polling) ---
print("3. Bắt đầu kiểm tra trạng thái quá trình tạo video (Polling)...")
poll_count = 0
while not operation.done:
    poll_count += 1
    print(f"   [{poll_count}] Waiting for video generation to complete... (Chờ 10 giây)")
    time.sleep(10)
    operation = client.operations.get(operation)

print("4. Quá trình tạo video đã HOÀN TẤT.")

# --- BƯỚC 4: TẢI XUỐNG VÀ LƯU VIDEO ---
generated_video = operation.response.generated_videos[0]
video_file = generated_video.video
print(f"5. Tải xuống video từ URL: {video_file.uri}")

try:
    # Lệnh tải xuống file (Download the generated video)
    client.files.download(file=video_file)
    
    # Lệnh lưu file đã tải xuống vào đĩa
    file_name = "dialogue_example.mp4"
    video_file.save(file_name)
    
    print(f"6. ✅ Hoàn thành! Video đã được lưu vào: {file_name}")

except Exception as e:
    print(f"LỖI trong quá trình tải xuống/lưu: {e}")