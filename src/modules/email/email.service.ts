import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../../config/env';
import { createChildLogger } from '../../config/logger';
import { EmailJobPayload, dispatchEmail } from '../../queues';

const logger = createChildLogger('EmailService');

export class EmailService {
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }

  async sendMail(payload: EmailJobPayload): Promise<boolean> {
    try {
      if (env.NODE_ENV === 'test' || env.SMTP_USER === 'your-smtp-user') {
        logger.info({ to: payload.to, subject: payload.subject }, 'Test mode: email suppressed');
        return true;
      }

      await this.transporter.sendMail({
        from: env.SMTP_FROM,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      });

      logger.info({ to: payload.to, subject: payload.subject }, 'Email delivered successfully');
      return true;
    } catch (error) {
      logger.error({ error, to: payload.to, subject: payload.subject }, 'Failed to deliver email');
      throw error;
    }
  }

  async notifyWorkOrderAssigned(params: {
    to: string;
    technicianName: string;
    workOrderId: string;
    title: string;
    priority: string;
    locationName?: string;
  }): Promise<void> {
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">New Work Order Assigned</h2>
        <p>Hello <strong>${params.technicianName}</strong>,</p>
        <p>You have been assigned to a new maintenance work order:</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Title:</strong> ${params.title}</p>
          <p style="margin: 5px 0;"><strong>Priority:</strong> <span style="color: #dc2626;">${params.priority}</span></p>
          ${params.locationName ? `<p style="margin: 5px 0;"><strong>Location:</strong> ${params.locationName}</p>` : ''}
          <p style="margin: 5px 0;"><strong>Work Order ID:</strong> ${params.workOrderId}</p>
        </div>
        <p>Please log in to FixFlow to review and accept this assignment.</p>
      </div>
    `;

    await dispatchEmail({
      to: params.to,
      subject: `[FixFlow] Assigned: ${params.title}`,
      html,
      text: `You have been assigned to work order "${params.title}" (Priority: ${params.priority}).`,
      metadata: { workOrderId: params.workOrderId },
    });
  }

  async notifyStatusChanged(params: {
    to: string;
    recipientName: string;
    workOrderId: string;
    title: string;
    oldStatus: string;
    newStatus: string;
    changedByName: string;
  }): Promise<void> {
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">Work Order Status Updated</h2>
        <p>Hello <strong>${params.recipientName}</strong>,</p>
        <p>The status of work order <strong>"${params.title}"</strong> has been updated:</p>
        <p style="font-size: 16px; margin: 15px 0;">
          <span style="color: #6b7280;">${params.oldStatus}</span> &rarr; <strong style="color: #059669;">${params.newStatus}</strong>
        </p>
        <p style="color: #6b7280;">Updated by: ${params.changedByName}</p>
      </div>
    `;

    await dispatchEmail({
      to: params.to,
      subject: `[FixFlow] Status Update: ${params.title} (${params.newStatus})`,
      html,
      text: `Work order "${params.title}" status changed from ${params.oldStatus} to ${params.newStatus} by ${params.changedByName}.`,
      metadata: { workOrderId: params.workOrderId },
    });
  }

  async notifySlaBreached(params: {
    to: string;
    recipientName: string;
    workOrderId: string;
    title: string;
    priority: string;
    dueAt: Date;
  }): Promise<void> {
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 2px solid #ef4444; border-radius: 8px;">
        <h2 style="color: #dc2626;">SLA Target Overdue Alert</h2>
        <p>Hello <strong>${params.recipientName}</strong>,</p>
        <p>Work order <strong>"${params.title}"</strong> has exceeded its SLA resolution deadline.</p>
        <div style="background-color: #fee2e2; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Priority:</strong> ${params.priority}</p>
          <p style="margin: 5px 0;"><strong>Target Due At:</strong> ${params.dueAt.toISOString()}</p>
          <p style="margin: 5px 0;"><strong>Work Order ID:</strong> ${params.workOrderId}</p>
        </div>
        <p>Immediate action is required to resolve this ticket.</p>
      </div>
    `;

    await dispatchEmail({
      to: params.to,
      subject: `[URGENT] SLA Overdue: ${params.title}`,
      html,
      text: `Work order "${params.title}" (Priority: ${params.priority}) has exceeded its SLA deadline (${params.dueAt.toISOString()}).`,
      metadata: { workOrderId: params.workOrderId },
    });
  }
}

export const emailService = new EmailService();

