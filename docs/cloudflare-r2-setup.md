# Cloudflare R2 자료 공유 설정

자료 공유는 브라우저가 R2로 직접 업로드하고, Netlify Function이 5분짜리 서명 URL을 발급하는 방식입니다. R2 버킷을 공개로 열 필요가 없습니다.

## 1. R2 버킷 만들기

Cloudflare Dashboard → R2 Object Storage → Create bucket에서 버킷을 만듭니다.

## 2. API 토큰 만들기

R2 API Token을 만들고 해당 버킷에 `Object Read & Write` 권한만 부여합니다. Account ID, Access Key ID, Secret Access Key를 복사합니다.

## 3. 버킷 CORS

R2 버킷 Settings → CORS에 배포 도메인을 허용합니다.

```json
[
  {
    "AllowedOrigins": ["https://YOUR-SITE.netlify.app"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

로컬 테스트도 필요하면 `http://localhost:5173`과 `http://localhost:8888`을 `AllowedOrigins`에 추가합니다.

## 4. Netlify 환경변수

Netlify Site settings → Environment variables에 아래 값을 서버 변수로 등록합니다. `VITE_` 접두사를 붙이지 않습니다.

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
```

저장 후 새 배포를 실행하면 `자료 공유` 버튼이 활성화됩니다. 파일 제한은 10MB입니다.
