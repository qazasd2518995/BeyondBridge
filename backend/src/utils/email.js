/**
 * Email 通知系統
 * BeyondBridge Education Platform
 *
 * 使用 AWS SES 發送 Email
 */

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const nodemailer = require('nodemailer');

const PLATFORM_NAME = 'BeyondBridge';
const PLATFORM_URL = process.env.PLATFORM_URL || 'https://beyondbridge.onrender.com';
const EMAIL_PROVIDER = String(process.env.EMAIL_PROVIDER || (process.env.SMTP_PASS ? 'smtp' : 'ses')).trim().toLowerCase();
const DEFAULT_FROM_EMAIL = process.env.SMTP_USER || 'beyondbridge1020@gmail.com';

// 初始化 SES 客戶端
const SES_REGION = process.env.AWS_SES_REGION || process.env.AWS_REGION || 'ap-southeast-2';
const sesClient = new SESClient({
  region: SES_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// 發送者 Email（需在 SES 中驗證）
const FROM_EMAIL = process.env.EMAIL_FROM || DEFAULT_FROM_EMAIL;
const FROM_NAME = process.env.EMAIL_FROM_NAME || PLATFORM_NAME;
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE !== 'false'
  : SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER || DEFAULT_FROM_EMAIL;
const SMTP_PASS = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '';
let smtpTransporter = null;

function buildEmailSource() {
  if (/<[^>]+>/.test(FROM_EMAIL)) return FROM_EMAIL;
  return `${FROM_NAME} <${FROM_EMAIL}>`;
}

function getSmtpTransporter() {
  if (!SMTP_USER || !SMTP_PASS) {
    const error = new Error('SMTP_USER and SMTP_PASS are required when EMAIL_PROVIDER=smtp');
    error.code = 'SMTP_NOT_CONFIGURED';
    throw error;
  }

  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });
  }
  return smtpTransporter;
}

function classifyEmailError(error = {}) {
  const message = String(error?.message || error?.Error?.Message || '');
  const code = error?.Code || error?.code || error?.name || error?.Error?.Code || '';
  if (code === 'SMTP_NOT_CONFIGURED') {
    return {
      code: 'SMTP_NOT_CONFIGURED',
      message,
      provider: EMAIL_PROVIDER,
      source: buildEmailSource(),
      actionable: true
    };
  }
  if (/invalid login|authentication failed|username and password not accepted|application-specific password/i.test(message)) {
    return {
      code: 'SMTP_AUTH_FAILED',
      message,
      provider: EMAIL_PROVIDER,
      source: buildEmailSource(),
      actionable: true
    };
  }
  if (code === 'MessageRejected' && /not verified|failed the check/i.test(message)) {
    return {
      code: 'SES_IDENTITY_NOT_VERIFIED',
      message,
      provider: EMAIL_PROVIDER,
      region: SES_REGION,
      source: buildEmailSource(),
      actionable: true
    };
  }
  if (/sandbox/i.test(message)) {
    return {
      code: 'SES_SANDBOX_RESTRICTION',
      message,
      provider: EMAIL_PROVIDER,
      region: SES_REGION,
      source: buildEmailSource(),
      actionable: true
    };
  }
  return {
    code: code || 'EMAIL_SEND_FAILED',
    message: message || 'Email send failed',
    provider: EMAIL_PROVIDER,
    region: SES_REGION,
    source: buildEmailSource(),
    actionable: false
  };
}

function isEmailServiceSetupError(error = {}) {
  return [
    'SMTP_NOT_CONFIGURED',
    'SMTP_AUTH_FAILED',
    'SES_IDENTITY_NOT_VERIFIED',
    'SES_SANDBOX_RESTRICTION'
  ].includes(classifyEmailError(error).code);
}

function platformUrl(path = '/platform') {
  const base = String(PLATFORM_URL || '').replace(/\/+$/, '');
  const targetPath = String(path || '/platform').startsWith('/')
    ? String(path || '/platform')
    : `/${path}`;
  if (/\/platform$/i.test(base) && targetPath.startsWith('/platform')) {
    return `${base}${targetPath.replace(/^\/platform/, '') || '/'}`;
  }
  return `${base}${targetPath}`;
}

/**
 * 發送 Email
 * @param {string|string[]} to - 收件人 Email
 * @param {string} subject - 主旨
 * @param {string} htmlBody - HTML 內容
 * @param {string} textBody - 純文字內容（選填）
 */
async function sendEmail(to, subject, htmlBody, textBody = '') {
  const toAddresses = Array.isArray(to) ? to : [to];

  // 如果沒有純文字版本，從 HTML 移除標籤
  if (!textBody) {
    textBody = htmlBody.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  if (EMAIL_PROVIDER === 'smtp') {
    try {
      const info = await getSmtpTransporter().sendMail({
        from: buildEmailSource(),
        to: toAddresses,
        subject,
        html: htmlBody,
        text: textBody
      });
      console.log(`Email sent successfully via SMTP to ${toAddresses.join(', ')}: ${info.messageId}`);
      return { success: true, messageId: info.messageId, provider: 'smtp' };
    } catch (error) {
      const deliveryError = classifyEmailError(error);
      console.error('Failed to send email via SMTP:', deliveryError, error);
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
      return { success: false, error: deliveryError.message, deliveryError };
    }
  }

  const command = new SendEmailCommand({
    Source: buildEmailSource(),
    Destination: {
      ToAddresses: toAddresses
    },
    Message: {
      Subject: {
        Charset: 'UTF-8',
        Data: subject
      },
      Body: {
        Html: {
          Charset: 'UTF-8',
          Data: htmlBody
        },
        Text: {
          Charset: 'UTF-8',
          Data: textBody
        }
      }
    }
  });

  try {
    const response = await sesClient.send(command);
    console.log(`Email sent successfully to ${toAddresses.join(', ')}: ${response.MessageId}`);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    const deliveryError = classifyEmailError(error);
    console.error('Failed to send email:', deliveryError, error);
    // 在開發環境中不拋出錯誤，只記錄
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
    return { success: false, error: deliveryError.message, deliveryError };
  }
}

/**
 * 產生 Email 模板基礎結構
 */
function emailTemplate(title, content, footerText = '') {
  return `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px; background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                ${PLATFORM_NAME}
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0 0 10px; color: #6c757d; font-size: 14px;">
                ${footerText || '這封郵件由系統自動發送，請勿直接回覆。'}
              </p>
              <p style="margin: 0; color: #6c757d; font-size: 12px;">
                2026 ${PLATFORM_NAME}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * 按鈕樣式
 */
function buttonStyle(text, url, color = '#4F46E5') {
  return `
    <a href="${url}" style="display: inline-block; padding: 12px 24px; background-color: ${color}; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; margin: 10px 0;">
      ${text}
    </a>
  `;
}

// ============== 預設 Email 模板 ==============

/**
 * 發送歡迎 Email（註冊成功）
 */
async function sendWelcomeEmail(user) {
  const content = `
    <h2 style="margin: 0 0 20px; color: #1a1a1a; font-size: 20px;">
      歡迎加入 ${PLATFORM_NAME}！
    </h2>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      親愛的 ${user.displayName || user.email}，
    </p>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      感謝您註冊 ${PLATFORM_NAME} 教育平台！我們很高興能夠為您提供優質的數位教材與教學資源。
    </p>
    <p style="margin: 0 0 20px; color: #4a4a4a; line-height: 1.6;">
      您現在可以開始探索我們的教材庫，發現適合您的教學內容。
    </p>
    <div style="text-align: center; margin: 30px 0;">
      ${buttonStyle('開始使用', platformUrl('/platform/'))}
    </div>
    <p style="margin: 20px 0 0; color: #6c757d; font-size: 14px;">
      如有任何問題，歡迎隨時聯繫我們的客服團隊。
    </p>
  `;

  return sendEmail(
    user.email,
    `歡迎加入 ${PLATFORM_NAME}！`,
    emailTemplate(`歡迎加入 ${PLATFORM_NAME}`, content)
  );
}

/**
 * 發送授權到期提醒
 */
async function sendLicenseExpiryReminder(user, license, daysRemaining) {
  const urgency = daysRemaining <= 7 ? '緊急' : '';
  const content = `
    <h2 style="margin: 0 0 20px; color: ${daysRemaining <= 7 ? '#dc3545' : '#1a1a1a'}; font-size: 20px;">
      ${urgency}授權即將到期提醒
    </h2>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      親愛的 ${user.displayName || user.email}，
    </p>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      您的教材授權「<strong>${license.resourceTitle}</strong>」將於 <strong>${daysRemaining}</strong> 天後到期。
    </p>
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0 0 10px; color: #4a4a4a;">
        <strong>授權資訊：</strong>
      </p>
      <ul style="margin: 0; padding-left: 20px; color: #4a4a4a;">
        <li>教材名稱：${license.resourceTitle}</li>
        <li>授權類型：${license.licenseType === 'institutional' ? '機構授權' : '個人授權'}</li>
        <li>到期日期：${license.expiryDate}</li>
        ${license.seatCount ? `<li>授權人數：${license.seatCount} 人</li>` : ''}
      </ul>
    </div>
    <p style="margin: 0 0 20px; color: #4a4a4a; line-height: 1.6;">
      為確保您的教學不受影響，請及時續約授權。
    </p>
    <div style="text-align: center; margin: 30px 0;">
      ${buttonStyle('立即續約', platformUrl('/platform/#licenses'), daysRemaining <= 7 ? '#dc3545' : '#4F46E5')}
    </div>
  `;

  return sendEmail(
    user.email,
    `${urgency ? '[緊急] ' : ''}授權即將到期：${license.resourceTitle}`,
    emailTemplate('授權到期提醒', content)
  );
}

/**
 * 發送授權核准通知
 */
async function sendLicenseApproved(user, license) {
  const content = `
    <h2 style="margin: 0 0 20px; color: #28a745; font-size: 20px;">
      🎉 授權申請已核准！
    </h2>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      親愛的 ${user.displayName || user.email}，
    </p>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      恭喜！您的授權申請已經核准，現在可以開始使用教材了。
    </p>
    <div style="background-color: #d4edda; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #28a745;">
      <p style="margin: 0 0 10px; color: #155724;">
        <strong>授權資訊：</strong>
      </p>
      <ul style="margin: 0; padding-left: 20px; color: #155724;">
        <li>教材名稱：${license.resourceTitle}</li>
        <li>授權類型：${license.licenseType === 'institutional' ? '機構授權' : '個人授權'}</li>
        <li>生效日期：${license.startDate}</li>
        <li>到期日期：${license.expiryDate}</li>
        ${license.seatCount ? `<li>授權人數：${license.seatCount} 人</li>` : ''}
      </ul>
    </div>
    <div style="text-align: center; margin: 30px 0;">
      ${buttonStyle('開始使用教材', platformUrl('/platform/#library'), '#28a745')}
    </div>
  `;

  return sendEmail(
    user.email,
    `授權已核准：${license.resourceTitle}`,
    emailTemplate('授權核准通知', content)
  );
}

/**
 * 發送諮詢狀態更新通知
 */
async function sendConsultationUpdate(user, consultation, updateType) {
  let title, statusText, statusColor;

  switch (updateType) {
    case 'received':
      title = '諮詢請求已收到';
      statusText = '我們已收到您的諮詢請求，專員將盡快與您聯繫。';
      statusColor = '#17a2b8';
      break;
    case 'reviewing':
      title = '諮詢正在審核中';
      statusText = '您的諮詢請求正在由專員審核中，請耐心等候。';
      statusColor = '#ffc107';
      break;
    case 'quoted':
      title = '已收到報價';
      statusText = `我們已為您的諮詢提供報價：NT$ ${consultation.quote?.amount?.toLocaleString() || '待定'}`;
      statusColor = '#4F46E5';
      break;
    case 'in_progress':
      title = '諮詢進行中';
      statusText = '您的諮詢項目已開始執行，我們會持續更新進度。';
      statusColor = '#28a745';
      break;
    case 'completed':
      title = '諮詢已完成';
      statusText = '您的諮詢項目已完成，感謝您使用我們的服務！';
      statusColor = '#28a745';
      break;
    default:
      title = '諮詢狀態更新';
      statusText = '您的諮詢狀態已更新。';
      statusColor = '#6c757d';
  }

  const content = `
    <h2 style="margin: 0 0 20px; color: ${statusColor}; font-size: 20px;">
      ${title}
    </h2>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      親愛的 ${user.displayName || user.email}，
    </p>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      ${statusText}
    </p>
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0 0 10px; color: #4a4a4a;">
        <strong>諮詢資訊：</strong>
      </p>
      <ul style="margin: 0; padding-left: 20px; color: #4a4a4a;">
        <li>諮詢標題：${consultation.title}</li>
        <li>諮詢類型：${getConsultationTypeName(consultation.requestType)}</li>
        <li>目前狀態：${getConsultationStatusName(consultation.status)}</li>
        ${consultation.quote?.amount ? `<li>報價金額：NT$ ${consultation.quote.amount.toLocaleString()}</li>` : ''}
        ${consultation.quote?.validUntil ? `<li>報價有效期：${consultation.quote.validUntil}</li>` : ''}
      </ul>
    </div>
    <div style="text-align: center; margin: 30px 0;">
      ${buttonStyle('查看諮詢詳情', platformUrl('/platform/#consultations'))}
    </div>
  `;

  return sendEmail(
    user.email,
    `[${PLATFORM_NAME}] ${title}：${consultation.title}`,
    emailTemplate(title, content)
  );
}

/**
 * 發送討論區回覆通知
 */
async function sendDiscussionReplyNotification(user, post, reply) {
  const content = `
    <h2 style="margin: 0 0 20px; color: #4F46E5; font-size: 20px;">
      您的貼文收到新回覆
    </h2>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      親愛的 ${user.displayName || user.email}，
    </p>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      您在討論區發布的貼文「<strong>${post.title}</strong>」收到了一則新回覆。
    </p>
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #4F46E5;">
      <p style="margin: 0 0 10px; color: #6c757d; font-size: 14px;">
        <strong>${reply.userDisplayName}</strong> 回覆道：
      </p>
      <p style="margin: 0; color: #4a4a4a; line-height: 1.6;">
        ${reply.content.substring(0, 200)}${reply.content.length > 200 ? '...' : ''}
      </p>
    </div>
    <div style="text-align: center; margin: 30px 0;">
      ${buttonStyle('查看完整回覆', platformUrl(`/platform/#discussions/${post.postId}`))}
    </div>
  `;

  return sendEmail(
    user.email,
    `您的貼文收到新回覆：${post.title}`,
    emailTemplate('討論區回覆通知', content)
  );
}

/**
 * 發送班級加入通知（給教師）
 */
async function sendClassJoinNotification(teacher, student, classInfo) {
  const content = `
    <h2 style="margin: 0 0 20px; color: #4F46E5; font-size: 20px;">
      新學生加入班級
    </h2>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      親愛的 ${teacher.displayName || teacher.email} 老師，
    </p>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      有新學生加入了您的班級。
    </p>
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <ul style="margin: 0; padding-left: 20px; color: #4a4a4a;">
        <li>班級名稱：${classInfo.className}</li>
        <li>學生姓名：${student.displayName || student.email}</li>
        <li>加入時間：${new Date().toLocaleString('zh-TW')}</li>
      </ul>
    </div>
    <div style="text-align: center; margin: 30px 0;">
      ${buttonStyle('管理班級', platformUrl(`/platform/#classes/${classInfo.classId}`))}
    </div>
  `;

  return sendEmail(
    teacher.email,
    `新學生加入班級：${classInfo.className}`,
    emailTemplate('班級加入通知', content)
  );
}

/**
 * 發送作業截止提醒
 */
async function sendAssignmentReminder(user, assignment, course) {
  const dueDate = new Date(assignment.dueDate);
  const now = new Date();
  const hoursRemaining = Math.ceil((dueDate - now) / (1000 * 60 * 60));

  let timeRemaining;
  let urgencyColor = '#f59e0b'; // 黃色
  if (hoursRemaining < 24) {
    timeRemaining = `${hoursRemaining} 小時`;
    urgencyColor = '#ef4444'; // 紅色
  } else {
    timeRemaining = `${Math.ceil(hoursRemaining / 24)} 天`;
  }

  const content = `
    <h2 style="margin: 0 0 20px; color: ${urgencyColor}; font-size: 20px;">
      作業即將截止
    </h2>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      親愛的 ${user.displayName || user.email}，
    </p>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      您的作業即將到期，請記得在截止日期前完成提交！
    </p>
    <div style="background-color: #fff7ed; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid ${urgencyColor};">
      <p style="margin: 0 0 10px; color: #9a3412;">
        <strong>作業資訊：</strong>
      </p>
      <ul style="margin: 0; padding-left: 20px; color: #9a3412;">
        <li>作業名稱：${assignment.title}</li>
        <li>所屬課程：${course.title}</li>
        <li>截止時間：${dueDate.toLocaleString('zh-TW')}</li>
        <li>剩餘時間：<strong>${timeRemaining}</strong></li>
      </ul>
    </div>
    <div style="text-align: center; margin: 30px 0;">
      ${buttonStyle('前往作業', platformUrl(`/platform/assignment/${assignment.assignmentId}`), urgencyColor)}
    </div>
  `;

  return sendEmail(
    user.email,
    `[作業提醒] ${assignment.title} - 剩餘 ${timeRemaining}`,
    emailTemplate('作業截止提醒', content)
  );
}

/**
 * 發送成績通知
 */
async function sendGradeNotification(user, gradeData) {
  const percentage = Math.round((gradeData.grade / gradeData.maxGrade) * 100);
  const passed = percentage >= (gradeData.gradeToPass || 60);
  const statusColor = passed ? '#10b981' : '#ef4444';
  const statusText = passed ? '恭喜通過！' : '未達及格標準';

  const content = `
    <h2 style="margin: 0 0 20px; color: ${statusColor}; font-size: 20px;">
      ${gradeData.type === 'assignment' ? '作業' : '測驗'}成績通知
    </h2>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      親愛的 ${user.displayName || user.email}，
    </p>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      您的${gradeData.type === 'assignment' ? '作業' : '測驗'}「${gradeData.title}」已經批改完成。
    </p>
    <div style="background-color: ${passed ? '#d1fae5' : '#fee2e2'}; padding: 30px; border-radius: 8px; margin: 20px 0; text-align: center;">
      <div style="font-size: 48px; font-weight: bold; color: ${statusColor};">
        ${gradeData.grade}/${gradeData.maxGrade}
      </div>
      <div style="font-size: 24px; color: #666; margin-top: 10px;">
        ${percentage}%
      </div>
      <div style="font-size: 18px; color: ${statusColor}; margin-top: 10px; font-weight: 500;">
        ${statusText}
      </div>
    </div>
    ${gradeData.feedback ? `
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #4F46E5;">
      <p style="margin: 0 0 10px; color: #4a4a4a;">
        <strong>教師回饋：</strong>
      </p>
      <p style="margin: 0; color: #4a4a4a; line-height: 1.6;">
        ${gradeData.feedback}
      </p>
    </div>
    ` : ''}
    <div style="text-align: center; margin: 30px 0;">
      ${buttonStyle('查看詳情', platformUrl('/platform/grades'))}
    </div>
  `;

  return sendEmail(
    user.email,
    `[成績通知] ${gradeData.title} - ${percentage}%`,
    emailTemplate('成績通知', content)
  );
}

/**
 * 發送課程公告通知
 */
async function sendCourseAnnouncement(users, announcement, course) {
  const results = [];

  for (const user of users) {
    const content = `
      <h2 style="margin: 0 0 20px; color: #4F46E5; font-size: 20px;">
        ${course.title} - 新公告
      </h2>
      <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
        親愛的 ${user.displayName || user.email}，
      </p>
      <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
        您報名的課程「${course.title}」發布了新公告：
      </p>
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0;">
        <h3 style="margin: 0 0 10px; color: #1a1a1a;">
          ${announcement.title}
        </h3>
        <div style="color: #4a4a4a; line-height: 1.6;">
          ${announcement.contentHtml || announcement.content}
        </div>
        <p style="margin: 15px 0 0; color: #6c757d; font-size: 12px;">
          發布者：${announcement.authorName} | ${new Date(announcement.createdAt).toLocaleString('zh-TW')}
        </p>
      </div>
      <div style="text-align: center; margin: 30px 0;">
        ${buttonStyle('前往課程', platformUrl(`/platform/course/${course.courseId}`))}
      </div>
    `;

    const result = await sendEmail(
      user.email,
      `[${course.title}] ${announcement.title}`,
      emailTemplate('課程公告', content)
    );
    results.push(result);
  }

  return results;
}

/**
 * 發送測驗提醒
 */
async function sendQuizReminder(user, quiz, course) {
  const openDate = new Date(quiz.openDate);
  const closeDate = new Date(quiz.closeDate);
  const now = new Date();

  let statusText, urgencyColor;
  if (now < openDate) {
    statusText = `將於 ${openDate.toLocaleString('zh-TW')} 開放`;
    urgencyColor = '#3b82f6';
  } else {
    const hoursRemaining = Math.ceil((closeDate - now) / (1000 * 60 * 60));
    if (hoursRemaining < 24) {
      statusText = `剩餘 ${hoursRemaining} 小時截止`;
      urgencyColor = '#ef4444';
    } else {
      statusText = `剩餘 ${Math.ceil(hoursRemaining / 24)} 天截止`;
      urgencyColor = '#f59e0b';
    }
  }

  const content = `
    <h2 style="margin: 0 0 20px; color: ${urgencyColor}; font-size: 20px;">
      測驗提醒
    </h2>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      親愛的 ${user.displayName || user.email}，
    </p>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      提醒您有測驗需要完成！
    </p>
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid ${urgencyColor};">
      <ul style="margin: 0; padding-left: 20px; color: #4a4a4a;">
        <li>測驗名稱：${quiz.title}</li>
        <li>所屬課程：${course.title}</li>
        <li>時間限制：${quiz.timeLimit ? `${quiz.timeLimit} 分鐘` : '無限制'}</li>
        <li>最多嘗試：${quiz.maxAttempts || '無限制'} 次</li>
        <li>及格分數：${quiz.passingGrade || 60}%</li>
        <li>狀態：<strong style="color: ${urgencyColor};">${statusText}</strong></li>
      </ul>
    </div>
    <div style="text-align: center; margin: 30px 0;">
      ${buttonStyle('開始測驗', platformUrl(`/platform/quiz/${quiz.quizId}`), urgencyColor)}
    </div>
  `;

  return sendEmail(
    user.email,
    `[測驗提醒] ${quiz.title} - ${statusText}`,
    emailTemplate('測驗提醒', content)
  );
}

/**
 * 發送學習進度摘要（每日/每週）
 */
async function sendLearningSummary(user, summaryData) {
  const periodText = summaryData.period === 'weekly' ? '每週' : '每日';

  const content = `
    <h2 style="margin: 0 0 20px; color: #4F46E5; font-size: 20px;">
      您的${periodText}學習報告
    </h2>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      親愛的 ${user.displayName || user.email}，
    </p>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      以下是您${summaryData.period === 'weekly' ? '這週' : '今天'}的學習概況：
    </p>

    <div style="display: flex; justify-content: space-around; margin: 20px 0; text-align: center;">
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; flex: 1; margin: 0 5px;">
        <div style="font-size: 32px; font-weight: bold; color: #4F46E5;">${summaryData.studyHours || 0}</div>
        <div style="color: #666; font-size: 14px;">學習時數</div>
      </div>
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; flex: 1; margin: 0 5px;">
        <div style="font-size: 32px; font-weight: bold; color: #10b981;">${summaryData.completedActivities || 0}</div>
        <div style="color: #666; font-size: 14px;">完成活動</div>
      </div>
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; flex: 1; margin: 0 5px;">
        <div style="font-size: 32px; font-weight: bold; color: #f59e0b;">${summaryData.assignmentsSubmitted || 0}</div>
        <div style="color: #666; font-size: 14px;">提交作業</div>
      </div>
    </div>

    ${summaryData.courses && summaryData.courses.length > 0 ? `
    <h3 style="margin: 25px 0 15px; color: #1a1a1a;">課程進度</h3>
    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
      ${summaryData.courses.map(c => `
        <div style="margin-bottom: 15px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <span>${c.title}</span>
            <span style="font-weight: bold;">${c.progress}%</span>
          </div>
          <div style="background: #e5e7eb; height: 8px; border-radius: 4px;">
            <div style="background: #4F46E5; height: 100%; border-radius: 4px; width: ${c.progress}%;"></div>
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${summaryData.upcomingDeadlines && summaryData.upcomingDeadlines.length > 0 ? `
    <h3 style="margin: 25px 0 15px; color: #ef4444;">即將到期</h3>
    <ul style="color: #4a4a4a; padding-left: 20px;">
      ${summaryData.upcomingDeadlines.map(d => `
        <li><strong>${d.title}</strong> - ${new Date(d.dueDate).toLocaleDateString('zh-TW')}</li>
      `).join('')}
    </ul>
    ` : ''}

    <div style="text-align: center; margin: 30px 0;">
      ${buttonStyle('查看完整報告', platformUrl('/platform/dashboard'))}
    </div>
  `;

  return sendEmail(
    user.email,
    `[BeyondBridge] 您的${periodText}學習報告`,
    emailTemplate(`${periodText}學習報告`, content)
  );
}

/**
 * 批量發送郵件
 */
async function sendBulkEmails(emails, options = {}) {
  const { batchSize = 10, delay = 1000 } = options;
  const results = [];

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(email => sendEmail(email.to, email.subject, email.html, email.text))
    );

    results.push(...batchResults);

    // 避免速率限制
    if (i + batchSize < emails.length) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`[Email] 批量發送完成: ${successCount}/${emails.length} 成功`);

  return {
    total: emails.length,
    success: successCount,
    failed: emails.length - successCount,
    results
  };
}

/**
 * 發送密碼重設 Email
 */
async function sendPasswordResetEmail(user, resetToken) {
  const resetUrl = platformUrl(`/platform/reset-password?token=${resetToken}`);

  const content = `
    <h2 style="margin: 0 0 20px; color: #1a1a1a; font-size: 20px;">
      重設您的密碼
    </h2>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      親愛的 ${user.displayName || user.email}，
    </p>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      我們收到了重設您帳號密碼的請求。點擊下方按鈕來設定新密碼：
    </p>
    <div style="text-align: center; margin: 30px 0;">
      ${buttonStyle('重設密碼', resetUrl)}
    </div>
    <p style="margin: 20px 0 0; color: #6c757d; font-size: 14px;">
      此連結將於 1 小時後失效。如果您沒有請求重設密碼，請忽略此郵件。
    </p>
    <p style="margin: 10px 0 0; color: #6c757d; font-size: 12px;">
      如果按鈕無法點擊，請複製以下連結到瀏覽器：<br>
      <a href="${resetUrl}" style="color: #4F46E5;">${resetUrl}</a>
    </p>
  `;

  return sendEmail(
    user.email,
    `重設您的 ${PLATFORM_NAME} 密碼`,
    emailTemplate('密碼重設', content)
  );
}

/**
 * 發送學生電子郵件驗證信
 */
async function sendStudentEmailVerificationEmail(user, verificationToken, classInfo = null) {
  const verificationUrl = platformUrl(`/platform/verify-email?token=${verificationToken}`);
  const className = classInfo?.name || user.pendingEnrollment?.className || '課程班級';

  const content = `
    <h2 style="margin: 0 0 20px; color: #1a1a1a; font-size: 20px;">
      驗證電子郵件以啟用學生帳號
    </h2>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      親愛的 ${user.displayName || user.email}，
    </p>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      你已使用通行碼註冊 ${PLATFORM_NAME}。請點擊下方按鈕驗證電子郵件，驗證後系統會正式啟用帳號並加入「${className}」。
    </p>
    <div style="text-align: center; margin: 30px 0;">
      ${buttonStyle('驗證電子郵件並啟用帳號', verificationUrl)}
    </div>
    <p style="margin: 20px 0 0; color: #6c757d; font-size: 14px;">
      此連結將於 48 小時後失效。如果你沒有註冊 ${PLATFORM_NAME}，請忽略此郵件。
    </p>
    <p style="margin: 10px 0 0; color: #6c757d; font-size: 12px;">
      如果按鈕無法點擊，請複製以下連結到瀏覽器：<br>
      <a href="${verificationUrl}" style="color: #4F46E5;">${verificationUrl}</a>
    </p>
  `;

  return sendEmail(
    user.email,
    `驗證你的 ${PLATFORM_NAME} 學生帳號`,
    emailTemplate('電子郵件驗證', content)
  );
}

/**
 * 發送老師邀請信
 */
async function sendTeacherInvitationEmail(user, inviteToken, options = {}) {
  const inviteUrl = platformUrl(`/platform/accept-invite?token=${inviteToken}`);
  const courseNames = Array.isArray(options.courseNames) ? options.courseNames.filter(Boolean) : [];
  const courseList = courseNames.length > 0
    ? `<ul style="margin: 10px 0 20px; padding-left: 20px; color: #4a4a4a;">${courseNames.map(name => `<li>${name}</li>`).join('')}</ul>`
    : '<p style="margin: 0 0 20px; color: #4a4a4a; line-height: 1.6;">管理員尚未指定課程，帳號啟用後可再由管理員授權。</p>';

  const content = `
    <h2 style="margin: 0 0 20px; color: #1a1a1a; font-size: 20px;">
      你已受邀成為 ${PLATFORM_NAME} 老師
    </h2>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      親愛的 ${user.displayName || user.email}，
    </p>
    <p style="margin: 0 0 15px; color: #4a4a4a; line-height: 1.6;">
      管理員已為你建立老師帳號。請點擊下方按鈕驗證電子郵件並設定自己的登入密碼。
    </p>
    <p style="margin: 0 0 10px; color: #4a4a4a; line-height: 1.6;">
      已預先授權的課程：
    </p>
    ${courseList}
    <div style="text-align: center; margin: 30px 0;">
      ${buttonStyle('接受邀請並設定密碼', inviteUrl)}
    </div>
    <p style="margin: 20px 0 0; color: #6c757d; font-size: 14px;">
      此邀請連結將於 7 天後失效。如果你沒有預期收到這封信，請忽略此郵件。
    </p>
    <p style="margin: 10px 0 0; color: #6c757d; font-size: 12px;">
      如果按鈕無法點擊，請複製以下連結到瀏覽器：<br>
      <a href="${inviteUrl}" style="color: #4F46E5;">${inviteUrl}</a>
    </p>
  `;

  return sendEmail(
    user.email,
    `${PLATFORM_NAME} 老師帳號邀請`,
    emailTemplate('老師帳號邀請', content)
  );
}

// ============== 輔助函數 ==============

function getConsultationTypeName(type) {
  const types = {
    custom_material: '客製化教材',
    training: '教育訓練',
    technical: '技術支援',
    licensing: '授權諮詢',
    other: '其他'
  };
  return types[type] || type;
}

function getConsultationStatusName(status) {
  const statuses = {
    pending: '待處理',
    reviewing: '審核中',
    quoted: '已報價',
    accepted: '已接受',
    rejected: '已拒絕',
    in_progress: '進行中',
    completed: '已完成',
    cancelled: '已取消'
  };
  return statuses[status] || status;
}

module.exports = {
  // 核心函數
  sendEmail,
  classifyEmailError,
  isEmailServiceSetupError,
  sendBulkEmails,
  emailTemplate,
  buttonStyle,

  // 用戶通知
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendStudentEmailVerificationEmail,
  sendTeacherInvitationEmail,

  // 授權相關
  sendLicenseExpiryReminder,
  sendLicenseApproved,

  // 諮詢相關
  sendConsultationUpdate,

  // 學習相關 (Moodle-style)
  sendAssignmentReminder,
  sendGradeNotification,
  sendCourseAnnouncement,
  sendQuizReminder,
  sendLearningSummary,

  // 社群相關
  sendDiscussionReplyNotification,
  sendClassJoinNotification,

  // 輔助函數
  getConsultationTypeName,
  getConsultationStatusName
};
