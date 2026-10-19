import { v2 as cloudinary } from 'cloudinary';
import { WorkOrderImage, UserRole } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { env } from '../../config/env';
import { createChildLogger } from '../../config/logger';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '../../common/errors/app-error';
import { UploadImageInput } from './uploads.schemas';

const logger = createChildLogger('UploadsService');

export class UploadsService {
  private isConfigured: boolean;

  constructor() {
    this.isConfigured =
      !!env.CLOUDINARY_CLOUD_NAME &&
      !env.CLOUDINARY_CLOUD_NAME.startsWith('your-') &&
      env.NODE_ENV !== 'test';

    if (this.isConfigured) {
      cloudinary.config({
        cloud_name: env.CLOUDINARY_CLOUD_NAME,
        api_key: env.CLOUDINARY_API_KEY,
        api_secret: env.CLOUDINARY_API_SECRET,
        secure: true,
      });
    }
  }

  async uploadWorkOrderImage(
    organizationId: string,
    workOrderId: string,
    userId: string,
    userRole: UserRole,
    input: UploadImageInput
  ): Promise<WorkOrderImage> {
    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, organizationId },
    });

    if (!workOrder) {
      throw NotFoundError('Work order');
    }

    if (
      userRole === UserRole.REPORTER &&
      workOrder.reporterId !== userId
    ) {
      throw ForbiddenError('You can only upload images to your own work orders');
    }

    if (
      userRole === UserRole.TECHNICIAN &&
      workOrder.assigneeId !== userId
    ) {
      throw ForbiddenError('Technicians can only upload images to assigned work orders');
    }

    const currentImageCount = await prisma.workOrderImage.count({
      where: { workOrderId },
    });

    if (currentImageCount >= 5) {
      throw BadRequestError('Maximum of 5 images per work order reached');
    }

    let publicId: string;
    let secureUrl: string;
    let byteSize: number = 102400;
    let format: string = input.format || 'jpg';

    if (this.isConfigured) {
      try {
        const uploadResult = await cloudinary.uploader.upload(input.image, {
          folder: `fixflow/${organizationId}/work-orders/${workOrderId}`,
          allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
          max_bytes: 10 * 1024 * 1024,
          resource_type: 'image',
        });

        publicId = uploadResult.public_id;
        secureUrl = uploadResult.secure_url;
        byteSize = uploadResult.bytes;
        format = uploadResult.format || format;
      } catch (error: any) {
        logger.error({ error }, 'Cloudinary image upload failed');
        throw BadRequestError(`Image upload failed: ${error.message || 'Invalid image payload'}`);
      }
    } else {
      publicId = `mock_fixflow_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      secureUrl = `https://res.cloudinary.com/fixflow-demo/image/upload/v1/${publicId}.${format}`;
    }

    return prisma.workOrderImage.create({
      data: {
        organizationId,
        workOrderId,
        uploadedById: userId,
        cloudinaryPublicId: publicId,
        secureUrl,
        resourceType: 'image',
        format,
        byteSize,
      },
    });
  }

  async listWorkOrderImages(
    organizationId: string,
    workOrderId: string,
    userId: string,
    userRole: UserRole
  ): Promise<WorkOrderImage[]> {
    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, organizationId },
    });

    if (!workOrder) {
      throw NotFoundError('Work order');
    }

    if (userRole === UserRole.REPORTER && workOrder.reporterId !== userId) {
      throw NotFoundError('Work order');
    }

    return prisma.workOrderImage.findMany({
      where: { workOrderId, organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });
  }

  async deleteWorkOrderImage(
    organizationId: string,
    workOrderId: string,
    imageId: string,
    userId: string,
    userRole: UserRole
  ): Promise<void> {
    const image = await prisma.workOrderImage.findFirst({
      where: { id: imageId, workOrderId, organizationId },
    });

    if (!image) {
      throw NotFoundError('Image');
    }

    const canDelete =
      userRole === UserRole.ADMIN ||
      userRole === UserRole.MANAGER ||
      image.uploadedById === userId;

    if (!canDelete) {
      throw ForbiddenError('You do not have permission to delete this image');
    }

    if (this.isConfigured) {
      try {
        await cloudinary.uploader.destroy(image.cloudinaryPublicId);
      } catch (error) {
        logger.error({ error, publicId: image.cloudinaryPublicId }, 'Cloudinary image delete error');
      }
    }

    await prisma.workOrderImage.delete({
      where: { id: imageId },
    });
  }
}

export const uploadsService = new UploadsService();

