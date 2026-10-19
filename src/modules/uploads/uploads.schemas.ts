import { z } from 'zod';

export const uploadImageSchema = z.object({
  image: z.string().min(1, 'Image data (base64 data URI or URL) is required'),
  format: z.enum(['jpg', 'jpeg', 'png', 'webp']).optional(),
});

export type UploadImageInput = z.infer<typeof uploadImageSchema>;

