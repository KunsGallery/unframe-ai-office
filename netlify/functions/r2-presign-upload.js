import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ALLOWED_EMAILS = new Set(["gallerykuns@gmail.com", "sylove887@gmail.com"]);
const ALLOWED_ROOMS = new Set(["general", "exhibition", "up", "u-sharp", "join", "virtual-gallery"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

function getSafeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "_");
}

function getR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

export async function handler(event) {
  const hasConfig = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"].every(
    (key) => process.env[key],
  );
  if (!hasConfig) return json(500, { error: "Cloudflare R2 환경변수가 설정되지 않았습니다." });

  if (event.httpMethod === "POST") {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { error: "잘못된 업로드 요청입니다." });
    }

    const email = String(body.userEmail || "").toLowerCase();
    const roomId = String(body.roomId || "");
    const fileName = String(body.fileName || "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    const contentType = String(body.contentType || "application/octet-stream").slice(0, 120);
    const size = Number(body.size);
    if (!ALLOWED_EMAILS.has(email) || !ALLOWED_ROOMS.has(roomId) || !fileName || !Number.isInteger(size) || size <= 0 || size > MAX_FILE_SIZE) {
      return json(400, { error: "허용되지 않은 파일 업로드 요청입니다." });
    }

    const key = `team-chat/${roomId}/${getSafeKey(email)}/${Date.now()}-${fileName}`;
    try {
      const uploadUrl = await getSignedUrl(
        getR2Client(),
        new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, ContentType: contentType }),
        { expiresIn: 300 },
      );
      return json(200, {
        uploadUrl,
        fileUrl: `/.netlify/functions/r2-presign-upload?key=${encodeURIComponent(key)}`,
      });
    } catch (error) {
      console.error("Failed to create R2 upload URL", error);
      return json(500, { error: "Cloudflare R2 업로드 주소를 만들지 못했습니다." });
    }
  }

  if (event.httpMethod === "GET") {
    const key = String(event.queryStringParameters?.key || "");
    if (!key.startsWith("team-chat/") || key.includes("..")) return json(400, { error: "잘못된 파일 주소입니다." });
    try {
      const url = await getSignedUrl(
        getR2Client(),
        new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }),
        { expiresIn: 300 },
      );
      return { statusCode: 302, headers: { Location: url, "Cache-Control": "private, max-age=60" }, body: "" };
    } catch (error) {
      console.error("Failed to create R2 download URL", error);
      return json(404, { error: "파일을 찾을 수 없습니다." });
    }
  }

  return json(405, { error: "지원하지 않는 요청입니다." });
}
