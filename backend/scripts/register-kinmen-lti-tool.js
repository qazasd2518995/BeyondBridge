/**
 * 註冊金門語教材為 LTI 1.3 Tool
 *
 * 這個腳本會在 DynamoDB 中創建金門語教材的 LTI Tool 記錄，
 * 讓教師可以在課程中添加金門語學習活動。
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'beyondbridge';

async function registerKinmenTool() {
  const toolId = 'kinmen-language-tool';
  const now = new Date().toISOString();

  // 先檢查是否已存在
  try {
    const existing = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: 'LTI_TOOL',
        SK: `TOOL#${toolId}`
      }
    }));

    if (existing.Item) {
      console.log('金門語教材 LTI Tool 已存在，更新中...');
    }
  } catch (e) {
    // 不存在，繼續創建
  }

  const tool = {
    PK: 'LTI_TOOL',
    SK: `TOOL#${toolId}`,
    toolId,
    name: '金門語學習平台',
    description: '金門語言與文化學習教材，包含六個單元的語言課程、互動練習和文化內容。',
    toolUrl: 'http://localhost:8080/index.html',
    version: '1.3',
    ltiVersion: '1.3',
    courseId: null,  // null = 全站可用
    isGlobal: true,

    // LTI 1.1 (備用)
    consumerKey: `bb_kinmen_${Date.now()}`,
    consumerSecret: uuidv4(),

    // LTI 1.3 配置
    clientId: uuidv4(),
    deploymentId: 'deploy_kinmen',
    platformId: 'https://beyondbridge.edu',
    publicKeysetUrl: 'http://localhost:8080/api/lti/jwks',
    loginUrl: 'http://localhost:8080/api/lti/login',
    oidcLoginUrl: 'http://localhost:8080/api/lti/login',
    targetLinkUri: 'http://localhost:8080/api/lti/launch',
    deepLinkingUrl: 'http://localhost:8080/api/lti/deep-link',
    redirectUris: [
      'http://localhost:8080/api/lti/launch',
      'http://localhost:8080/api/lti/deep-link'
    ],

    // 自訂參數
    customParameters: {
      platform: 'kinmen-dialect',
      units_enabled: '1,2,3,4,5,6'
    },

    // UI 設定
    iconUrl: 'http://localhost:8080/images/logo.png',
    privacyLevel: 'public',  // 傳送完整用戶資訊
    allowGradePassback: true,
    allowMembershipService: false,
    allowContentSelection: true,
    launchContainer: 'iframe',  // iframe 或 window

    // LTI 1.3 服務配置
    services: {
      ags: {
        enabled: true,
        scopes: ['score', 'lineitem', 'result']
      },
      nrps: {
        enabled: false,
        scopes: ['contextmembership.readonly']
      },
      deepLinking: {
        enabled: true
      }
    },

    status: 'active',
    createdBy: 'system',
    createdAt: now,
    updatedAt: now
  };

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: tool
  }));

  console.log('✅ 金門語教材 LTI Tool 註冊成功！');
  console.log('');
  console.log('Tool 資訊:');
  console.log(`  - Tool ID: ${tool.toolId}`);
  console.log(`  - 名稱: ${tool.name}`);
  console.log(`  - Client ID: ${tool.clientId}`);
  console.log(`  - Deployment ID: ${tool.deploymentId}`);
  console.log(`  - OIDC Login URL: ${tool.oidcLoginUrl}`);
  console.log(`  - Target Link URI: ${tool.targetLinkUri}`);
  console.log(`  - JWKS URL: ${tool.publicKeysetUrl}`);
  console.log('');
  console.log('現在可以在 BeyondBridge 平台的課程中添加金門語學習活動了！');
}

registerKinmenTool().catch(console.error);
