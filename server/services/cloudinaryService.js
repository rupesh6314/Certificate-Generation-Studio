import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Uploads a PDF buffer to Cloudinary and returns the secure URL.
 * @param {Buffer} buffer - The PDF file buffer to upload.
 * @returns {Promise<string|null>} The secure URL of the uploaded PDF or null if unconfigured.
 */
export const uploadPdfBuffer = (buffer) => {
  return new Promise((resolve, reject) => {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
      // Gracefully resolve with null if Cloudinary is not configured in .env
      return resolve(null);
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        format: 'pdf',
      },
      (error, result) => {
        if (error) {
          console.warn('[Cloudinary] Upload failed:', error.message);
          return resolve(null);
        }
        resolve(result.secure_url);
      }
    );

    uploadStream.end(buffer);
  });
};

export default {
  uploadPdfBuffer,
};
