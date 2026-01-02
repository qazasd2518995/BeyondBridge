/**
 * Email 通知系統
 * BeyondBridge Education Platform
 *
 * 使用 AWS SES 發送 Email
 */

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

// 初始化 SES 客戶端
const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// 發送者 Email（需在 SES 中驗證）
const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@beyondbridge.com';
const PLATFORM_NAME = 'BeyondBridge';
const PLATFORM_URL = process.env.PLATFORM_URL || 'https://beyondbridge.onrender.com';

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

  const command = new SendEmailCommand({
    Source: `${PLATFORM_NAME} <${FROM_EMAIL}>`,
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
    console.error('Failed to send email:', error);
    // 在開發環境中不拋出錯誤，只記錄
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
    return { success: false, error: error.message };
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
                &copy; ${new Date().getFullYear()} ${PLATFORM_NAME}. All rights reserved.
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
      ${buttonStyle('開始使用', `${PLATFORM_URL}/platform/`)}
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
      ${buttonStyle('立即續約', `${PLATFORM_URL}/platform/#licenses`, daysRemaining <= 7 ? '#dc3545' : '#4F46E5')}
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
      ${buttonStyle('開始使用教材', `${PLATFORM_URL}/platform/#library`, '#28a745')}
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
      ${buttonStyle('查看諮詢詳情', `${PLATFORM_URL}/platform/#consultations`)}
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
      ${buttonStyle('查看完整回覆', `${PLATFORM_URL}/platform/#discussions/${post.postId}`)}
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
      ${buttonStyle('管理班級', `${PLATFORM_URL}/platform/#classes/${classInfo.classId}`)}
    </div>
  `;

  return sendEmail(
    teacher.email,
    `新學生加入班級：${classInfo.className}`,
    emailTemplate('班級加入通知', content)
  );
}

/**
 * 發送密碼重設 Email
 */
async function sendPasswordResetEmail(user, resetToken) {
  const resetUrl = `${PLATFORM_URL}/platform/reset-password?token=${resetToken}`;

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
  sendEmail,
  emailTemplate,
  buttonStyle,
  sendWelcomeEmail,
  sendLicenseExpiryReminder,
  sendLicenseApproved,
  sendConsultationUpdate,
  sendDiscussionReplyNotification,
  sendClassJoinNotification,
  sendPasswordResetEmail,
  getConsultationTypeName,
  getConsultationStatusName
};
