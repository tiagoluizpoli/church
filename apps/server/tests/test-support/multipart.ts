interface MultipartFileInput {
  field: string;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

/** A one-file `multipart/form-data` body for `app.inject`. */
export function multipartFile({
  field,
  filename,
  contentType,
  bytes,
}: MultipartFileInput) {
  const boundary = '----church-test-boundary';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return {
    payload,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}
