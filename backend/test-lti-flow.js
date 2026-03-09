/**
 * LTI 1.3 完整流程測試腳本
 *
 * 測試步驟：
 * 1. JWKS 端點
 * 2. OpenID 配置
 * 3. Token 端點
 * 4. AGS 端點（Line Items）
 * 5. Deep Linking 回調
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3002';

async function testEndpoint(name, url, options = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`測試: ${name}`);
  console.log(`URL: ${url}`);
  console.log('='.repeat(60));

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': options.body ? 'application/json' : undefined,
        ...options.headers
      }
    });

    const contentType = response.headers.get('content-type');
    let data;

    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else if (contentType?.includes('text/html')) {
      data = await response.text();
      data = data.substring(0, 500) + (data.length > 500 ? '...[truncated]' : '');
    } else {
      data = await response.text();
    }

    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Response:`, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);

    return { success: response.ok, status: response.status, data };
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('\n🚀 LTI 1.3 流程測試開始\n');
  console.log(`Base URL: ${BASE_URL}`);

  // 1. 測試 JWKS
  await testEndpoint(
    '1. JWKS 端點 (Platform 公鑰)',
    `${BASE_URL}/api/lti/13/jwks`
  );

  // 2. 測試 OpenID 配置
  await testEndpoint(
    '2. OpenID Configuration',
    `${BASE_URL}/api/lti/13/.well-known/openid-configuration`
  );

  // 3. 測試 Platform 配置
  await testEndpoint(
    '3. Platform Configuration',
    `${BASE_URL}/api/lti/13/config`
  );

  // 4. 測試 Token 端點 (Client Credentials Flow)
  const tokenResult = await testEndpoint(
    '4. OAuth 2.0 Token 端點',
    `${BASE_URL}/api/lti/13/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: 'test_client_id',
        scope: 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem https://purl.imsglobal.org/spec/lti-ags/scope/score'
      }).toString()
    }
  );

  // 5. 測試 AGS Line Items (需要 token)
  if (tokenResult.success && tokenResult.data?.access_token) {
    const accessToken = tokenResult.data.access_token;

    await testEndpoint(
      '5. AGS Line Items (GET)',
      `${BASE_URL}/api/lti/13/ags/courses/test_course/lineitems`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    // 6. 建立 Line Item
    const lineItemResult = await testEndpoint(
      '6. AGS 建立 Line Item (POST)',
      `${BASE_URL}/api/lti/13/ags/courses/test_course/lineitems`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scoreMaximum: 100,
          label: '金門語教材 - 單元測驗',
          tag: 'kinmen_unit_1'
        })
      }
    );

    // 7. 提交成績
    if (lineItemResult.success && lineItemResult.data?.id) {
      const lineitemId = lineItemResult.data.id.split('/').pop();

      await testEndpoint(
        '7. AGS 提交成績 (POST scores)',
        `${BASE_URL}/api/lti/13/ags/courses/test_course/lineitems/${lineitemId}/scores`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: 'student_001',
            scoreGiven: 85,
            scoreMaximum: 100,
            activityProgress: 'Completed',
            gradingProgress: 'FullyGraded',
            comment: '測試成績提交'
          })
        }
      );

      // 8. 取得成績結果
      await testEndpoint(
        '8. AGS 取得成績結果 (GET results)',
        `${BASE_URL}/api/lti/13/ags/courses/test_course/lineitems/${lineitemId}/results`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );
    }
  } else {
    console.log('\n⚠️ 跳過 AGS 測試 (無法取得 access token)');
  }

  // 9. 測試 Tool Progress Proxy
  await testEndpoint(
    '9. Tool Progress Proxy (POST)',
    `${BASE_URL}/api/lti/13/tools/kinmen-tool/progress`,
    {
      method: 'POST',
      body: JSON.stringify({
        userId: 'student_001',
        unit: 'vocabulary',
        progress: 75,
        activityProgress: 'InProgress',
        details: {
          vocabulary: { learned: ['apple', 'banana', 'orange'] }
        }
      })
    }
  );

  // 10. 測試 Deep Linking Callback (模擬 Tool 回傳)
  // 建立簡化的 JWT payload
  const dlPayload = {
    iss: 'http://localhost:8080',
    aud: 'https://beyondbridge.edu',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiDeepLinkingResponse',
    'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
    'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': [
      {
        type: 'ltiResourceLink',
        title: '金門語教材 - 詞彙學習',
        url: 'http://localhost:8080/unit-1.html'
      }
    ],
    'https://purl.imsglobal.org/spec/lti-dl/claim/data': JSON.stringify({
      courseId: 'test_course',
      toolId: 'kinmen-tool'
    })
  };

  // 簡化的 JWT (無簽名，僅用於測試)
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(dlPayload)).toString('base64url');
  const testJwt = `${header}.${payload}.`;

  await testEndpoint(
    '10. Deep Linking Callback',
    `${BASE_URL}/api/lti/13/dl/callback`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ JWT: testJwt }).toString()
    }
  );

  // 11. 取得 Deep Linking 資源
  await testEndpoint(
    '11. Deep Linking 課程資源 (GET)',
    `${BASE_URL}/api/lti/13/dl/resources/test_course`
  );

  console.log('\n' + '='.repeat(60));
  console.log('✅ LTI 1.3 流程測試完成');
  console.log('='.repeat(60) + '\n');
}

runTests().catch(console.error);
