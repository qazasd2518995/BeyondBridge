/**
 * 為四門課程新增作業、測驗、題庫、討論區內容
 * 先清除空白/舊資料，再建立新資料
 * 執行方式：node backend/scripts/seed-course-content.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: true }
});
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'beyondbridge';

function generateId(prefix) {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${ts}${rnd}`;
}

async function putItem(item) {
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
}

async function scanByType(entityType) {
  const result = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: 'entityType = :t',
    ExpressionAttributeValues: { ':t': entityType }
  }));
  return result.Items || [];
}

async function deleteItem(pk, sk) {
  await docClient.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { PK: pk, SK: sk } }));
}

async function getUserByEmail(email) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI4',
    KeyConditionExpression: 'email = :email',
    ExpressionAttributeValues: { ':email': email }
  }));
  return result.Items?.find(i => i.entityType === 'USER') || null;
}

// ─── 課程資料 ───

const COURSES = [
  {
    courseId: 'course_mmi1vuwctym33b',
    title: '泰山高中德語課',
    short: 'german',
  },
  {
    courseId: 'course_mmi2bccrxncmlp',
    title: '心靈成長 Mindful Minds',
    short: 'mindful',
  },
  {
    courseId: 'course_mmi2vk8rfjnu0g',
    title: '金門語',
    short: 'kinmen',
  },
  {
    courseId: 'course_mmi2z49pq4crd3',
    title: '泰雅族語教學',
    short: 'atayal',
  },
];

// ─── Step 1: 清除舊資料 ───

async function cleanOldData() {
  console.log('\n🗑  清除舊資料...');
  let deleted = 0;

  for (const type of ['ASSIGNMENT', 'QUIZ', 'QUESTIONS', 'QUESTION_CATEGORIES', 'FORUM', 'DISCUSSION', 'FORUM_DISCUSSION', 'FORUM_POST']) {
    const items = await scanByType(type);
    for (const item of items) {
      await deleteItem(item.PK, item.SK);
      deleted++;
    }
    if (items.length > 0) console.log(`   ✗ 刪除 ${items.length} 筆 ${type}`);
  }

  console.log(`   共刪除 ${deleted} 筆舊資料\n`);
}

// ─── Step 2: 建立作業 ───

function getAssignments(courseId, courseTitle, userId, now) {
  const data = {
    german: [
      { title: '德語自我介紹寫作', desc: '用德語撰寫一段 150 字的自我介紹，包含姓名、年齡、興趣和學習德語的原因。', instructions: '請使用正確的德語語法和拼寫，包含 Nominativ 和 Akkusativ 的使用。提交 PDF 或 Word 文件。', maxGrade: 100, dueOffset: 7 },
      { title: '德語日常對話練習', desc: '錄製一段 2 分鐘的德語日常對話影片，主題：在餐廳點餐。', instructions: '請與同學合作錄製，至少包含問候、點餐、結帳三個情境。可使用手機錄影後上傳。', maxGrade: 80, dueOffset: 14 },
      { title: '德語文法練習 - 動詞變位', desc: '完成動詞變位練習，涵蓋 sein、haben、werden 等常用動詞。', instructions: '下載附件中的練習卷，完成後拍照或掃描上傳。每題 5 分，共 20 題。', maxGrade: 100, dueOffset: 10 },
    ],
    mindful: [
      { title: '正念冥想日記（第一週）', desc: '記錄一週的正念冥想練習，每天至少 10 分鐘。', instructions: '請記錄每天的冥想時間、方法（呼吸觀察/身體掃描/walking meditation）以及練習後的感受。使用線上文字提交。', maxGrade: 50, dueOffset: 7 },
      { title: '情緒覺察報告', desc: '撰寫一份關於自身情緒覺察的反思報告。', instructions: '觀察自己一週內的情緒變化，記錄至少 3 個情緒事件，分析觸發原因、身體反應及處理方式。字數 800-1200 字。', maxGrade: 100, dueOffset: 14 },
      { title: '心靈成長讀書心得', desc: '閱讀指定書籍的前三章，撰寫讀書心得。', instructions: '請閱讀《正念的奇蹟》前三章，寫下你的理解、共鳴之處，以及如何應用在日常生活中。字數 600-1000 字。', maxGrade: 80, dueOffset: 21 },
    ],
    kinmen: [
      { title: '金門日常用語錄音', desc: '錄製 10 句金門日常用語的發音練習。', instructions: '參考學習平台上的發音示範，錄製以下日常用語：問候、感謝、道別、問路、點餐等情境。每句重複兩次。', maxGrade: 60, dueOffset: 7 },
      { title: '金門文化故事蒐集', desc: '蒐集一則金門在地文化故事或民間傳說，用中文撰寫並附上金門語關鍵詞彙。', instructions: '可訪問家中長輩或查閱資料，故事須包含背景介紹、故事內容、文化意涵。附上至少 10 個相關的金門語詞彙及解釋。', maxGrade: 100, dueOffset: 14 },
    ],
    atayal: [
      { title: '泰雅族語基礎詞彙練習', desc: '學習並練習 30 個泰雅族語基礎詞彙。', instructions: '從學習平台選擇「基礎詞彙」單元，完成 30 個詞彙的聽說練習，並錄音提交。包含數字、顏色、家族稱謂等類別。', maxGrade: 60, dueOffset: 7 },
      { title: '泰雅族文化研究報告', desc: '研究泰雅族的一項文化特色（如織布、紋面、狩獵文化等），撰寫研究報告。', instructions: '選擇一項泰雅族文化主題，蒐集資料撰寫 1000-1500 字的研究報告。需包含歷史背景、文化意義、現代傳承情況。附上參考資料來源。', maxGrade: 100, dueOffset: 21 },
      { title: '泰雅族語日常對話練習', desc: '與同學合作練習泰雅族語日常對話。', instructions: '使用學習平台的對話模擬功能練習後，與同學合作錄製一段 1-2 分鐘的泰雅族語對話。主題可選擇：問候、自我介紹、或詢問方向。', maxGrade: 80, dueOffset: 14 },
    ],
  };

  const courseData = data[COURSES.find(c => c.courseId === courseId).short];
  return courseData.map(a => {
    const assignmentId = generateId('assign');
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + a.dueOffset);
    return {
      PK: `ASSIGNMENT#${assignmentId}`,
      SK: 'META',
      entityType: 'ASSIGNMENT',
      GSI1PK: `COURSE#${courseId}`,
      GSI1SK: `ASSIGNMENT#${assignmentId}`,
      GSI2PK: `DUE#${dueDate.toISOString().split('T')[0]}`,
      GSI2SK: `ASSIGNMENT#${assignmentId}`,
      assignmentId,
      courseId,
      title: a.title,
      description: a.desc,
      instructions: a.instructions,
      dueDate: dueDate.toISOString(),
      maxGrade: a.maxGrade,
      submissionType: 'both',
      allowLateSubmission: true,
      lateDeductionPercent: 10,
      maxFiles: 5,
      maxFileSize: 10,
      allowedFileTypes: ['pdf', 'doc', 'docx', 'txt', 'zip', 'mp4', 'mp3'],
      visible: true,
      status: 'active',
      stats: { totalSubmissions: 0, gradedCount: 0, averageGrade: 0 },
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };
  });
}

// ─── Step 3: 建立測驗 ───

function getQuizzes(courseId, courseTitle, userId, now) {
  const data = {
    german: [
      {
        title: '德語基礎詞彙測驗',
        desc: '測試基礎德語詞彙的掌握程度，包含數字、顏色、日常物品等。',
        timeLimit: 20,
        questions: [
          { text: '「Guten Morgen」的中文意思是？', type: 'multiple_choice', options: ['早安', '午安', '晚安', '再見'], correct: '早安', points: 5 },
          { text: '德語的「Danke」表示感謝。', type: 'true_false', correct: 'true', points: 5 },
          { text: '德語中「Eins, Zwei, Drei」分別代表數字幾？', type: 'short_answer', correct: '1, 2, 3', points: 10 },
          { text: '「Ich heiße...」用於什麼情境？', type: 'multiple_choice', options: ['自我介紹', '點餐', '問路', '告別'], correct: '自我介紹', points: 5 },
          { text: '「Entschuldigung」的意思是？', type: 'multiple_choice', options: ['對不起/不好意思', '謝謝', '你好', '再見'], correct: '對不起/不好意思', points: 5 },
        ],
      },
      {
        title: '德語動詞變位小考',
        desc: '測試 sein、haben 等基礎動詞在不同人稱下的變位。',
        timeLimit: 15,
        questions: [
          { text: '「Ich ___ Student.」空格應填入 sein 的哪個形式？', type: 'multiple_choice', options: ['bin', 'bist', 'ist', 'sind'], correct: 'bin', points: 10 },
          { text: '「Du ___ ein Buch.」空格應填入 haben 的哪個形式？', type: 'multiple_choice', options: ['habe', 'hast', 'hat', 'haben'], correct: 'hast', points: 10 },
          { text: '請寫出 sein 的第三人稱單數形式（er/sie/es）。', type: 'short_answer', correct: 'ist', points: 10 },
          { text: '「Wir」對應的是第一人稱複數。', type: 'true_false', correct: 'true', points: 5 },
        ],
      },
    ],
    mindful: [
      {
        title: '正念基礎概念測驗',
        desc: '測試對正念冥想基本概念的理解。',
        timeLimit: 15,
        questions: [
          { text: '正念（Mindfulness）的核心精神是什麼？', type: 'multiple_choice', options: ['專注當下，不批判地覺察', '消除所有負面情緒', '控制自己的想法', '追求完美的心理狀態'], correct: '專注當下，不批判地覺察', points: 10 },
          { text: '正念冥想要求我們完全清除腦中的雜念。', type: 'true_false', correct: 'false', points: 5 },
          { text: '「身體掃描」冥想法的主要目的是什麼？', type: 'multiple_choice', options: ['覺察身體各部位的感受', '診斷身體疾病', '鍛鍊肌肉', '催眠入睡'], correct: '覺察身體各部位的感受', points: 10 },
          { text: '請簡述呼吸觀察法的基本步驟。', type: 'short_answer', correct: '找一個舒適的姿勢，閉上眼睛，將注意力集中在呼吸上，覺察氣息的進出，當注意力飄走時溫柔地帶回呼吸。', points: 15 },
          { text: '以下哪項不是正念練習的益處？', type: 'multiple_choice', options: ['預測未來事件', '減輕壓力與焦慮', '提升專注力', '改善情緒調節'], correct: '預測未來事件', points: 10 },
        ],
      },
    ],
    kinmen: [
      {
        title: '金門語發音測驗',
        desc: '測試金門語基礎發音和常用詞彙的掌握。',
        timeLimit: 15,
        questions: [
          { text: '金門語屬於哪個語言家族？', type: 'multiple_choice', options: ['閩南語系', '客家語系', '原住民語系', '粵語系'], correct: '閩南語系', points: 10 },
          { text: '金門語和臺灣閩南語完全相同。', type: 'true_false', correct: 'false', points: 5 },
          { text: '金門語中「食飯」的意思是？', type: 'multiple_choice', options: ['吃飯', '煮飯', '買飯', '賣飯'], correct: '吃飯', points: 5 },
          { text: '請寫出金門語「謝謝」的說法。', type: 'short_answer', correct: '多謝（to-siā）', points: 10 },
          { text: '金門特有的風獅爺文化與以下哪項有關？', type: 'multiple_choice', options: ['鎮風辟邪', '求雨祈福', '婚禮習俗', '漁獲豐收'], correct: '鎮風辟邪', points: 10 },
        ],
      },
    ],
    atayal: [
      {
        title: '泰雅族語基礎測驗',
        desc: '測試泰雅族語基礎詞彙和文化知識。',
        timeLimit: 20,
        questions: [
          { text: '泰雅族語中「Lokah su（你好）」是什麼場合使用？', type: 'multiple_choice', options: ['日常問候', '告別', '感謝', '道歉'], correct: '日常問候', points: 5 },
          { text: '泰雅族是台灣原住民族中分布最廣的族群之一。', type: 'true_false', correct: 'true', points: 5 },
          { text: '泰雅族的傳統織布藝術稱為什麼？', type: 'short_answer', correct: 'tminun', points: 10 },
          { text: '泰雅族語中「qulih」的意思是？', type: 'multiple_choice', options: ['魚', '鳥', '熊', '鹿'], correct: '魚', points: 5 },
          { text: '泰雅族傳統的「紋面」文化象徵什麼？', type: 'multiple_choice', options: ['成年與榮耀', '戰爭與勝利', '結婚紀念', '宗教儀式'], correct: '成年與榮耀', points: 10 },
          { text: '請寫出泰雅族語中「水」的說法。', type: 'short_answer', correct: 'qsiya', points: 10 },
        ],
      },
    ],
  };

  const courseData = data[COURSES.find(c => c.courseId === courseId).short];
  return courseData.map(q => {
    const quizId = generateId('quiz');
    const openDate = new Date();
    const closeDate = new Date();
    closeDate.setDate(closeDate.getDate() + 30);

    const questions = q.questions.map((question, idx) => {
      const questionId = generateId('qq');
      const base = {
        questionId,
        order: idx + 1,
        type: question.type,
        text: question.text,
        points: question.points,
        correctAnswer: question.correct,
      };
      if (question.type === 'multiple_choice') {
        base.options = question.options.map((opt, i) => ({
          id: `opt_${i}`,
          text: opt,
          isCorrect: opt === question.correct,
        }));
      } else if (question.type === 'true_false') {
        base.options = [
          { id: 'opt_true', text: '正確', isCorrect: question.correct === 'true' },
          { id: 'opt_false', text: '錯誤', isCorrect: question.correct === 'false' },
        ];
      }
      return base;
    });

    return {
      PK: `QUIZ#${quizId}`,
      SK: 'META',
      entityType: 'QUIZ',
      GSI1PK: `COURSE#${courseId}`,
      GSI1SK: `QUIZ#${quizId}`,
      quizId,
      courseId,
      title: q.title,
      description: q.desc,
      instructions: '請仔細閱讀每道題目，選擇或填寫正確答案。',
      openDate: openDate.toISOString(),
      closeDate: closeDate.toISOString(),
      timeLimit: q.timeLimit,
      maxAttempts: 3,
      gradeMethod: 'highest',
      shuffleQuestions: true,
      shuffleAnswers: true,
      showResults: 'immediately',
      showCorrectAnswers: true,
      passingGrade: 60,
      visible: true,
      questions,
      questionCount: questions.length,
      totalPoints: questions.reduce((sum, q) => sum + q.points, 0),
      status: 'active',
      stats: { totalAttempts: 0, averageScore: 0, passRate: 0 },
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };
  });
}

// ─── Step 4: 建立題庫 ───

function getQuestionBank(userId, now) {
  const categories = [
    { name: '德語', desc: '德語相關題目' },
    { name: '正念冥想', desc: '心靈成長與正念相關題目' },
    { name: '金門語', desc: '金門語及文化相關題目' },
    { name: '泰雅族語', desc: '泰雅族語及文化相關題目' },
  ];

  const catItems = categories.map(cat => {
    const catId = generateId('qcat');
    cat.id = catId;
    return {
      PK: `QCAT#${catId}`,
      SK: 'META',
      entityType: 'QUESTION_CATEGORIES',
      id: catId,
      name: cat.name,
      description: cat.desc,
      questionCount: 0,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };
  });

  const questionData = [
    // 德語
    { cat: '德語', title: '德語問候語', content: '「Wie geht es Ihnen?」的意思是？', type: 'multiple_choice', options: [{ text: '您好嗎？', isCorrect: true }, { text: '您叫什麼名字？', isCorrect: false }, { text: '您住哪裡？', isCorrect: false }, { text: '您幾歲？', isCorrect: false }], correctAnswer: '您好嗎？', difficulty: 'easy', tags: ['德語', '問候'] },
    { cat: '德語', title: '德語數字', content: '德語的「fünf」代表數字幾？', type: 'multiple_choice', options: [{ text: '3', isCorrect: false }, { text: '4', isCorrect: false }, { text: '5', isCorrect: true }, { text: '6', isCorrect: false }], correctAnswer: '5', difficulty: 'easy', tags: ['德語', '數字'] },
    { cat: '德語', title: '德語冠詞', content: '德語中「der」是哪種詞性的定冠詞？', type: 'multiple_choice', options: [{ text: '陽性', isCorrect: true }, { text: '陰性', isCorrect: false }, { text: '中性', isCorrect: false }, { text: '複數', isCorrect: false }], correctAnswer: '陽性', difficulty: 'medium', tags: ['德語', '文法'] },
    { cat: '德語', title: '德語動詞', content: '「sprechen」的意思是「說」。', type: 'true_false', correctAnswer: 'true', difficulty: 'easy', tags: ['德語', '動詞'] },
    // 正念
    { cat: '正念冥想', title: '正念定義', content: '正念（Mindfulness）最早源自哪個傳統？', type: 'multiple_choice', options: [{ text: '佛教禪修', isCorrect: true }, { text: '基督教冥想', isCorrect: false }, { text: '印度瑜伽', isCorrect: false }, { text: '道教養生', isCorrect: false }], correctAnswer: '佛教禪修', difficulty: 'medium', tags: ['正念', '歷史'] },
    { cat: '正念冥想', title: '冥想姿勢', content: '正念冥想必須以蓮花坐姿進行。', type: 'true_false', correctAnswer: 'false', difficulty: 'easy', tags: ['正念', '練習'] },
    { cat: '正念冥想', title: 'MBSR', content: 'MBSR（正念減壓法）是由誰所創立？', type: 'short_answer', correctAnswer: 'Jon Kabat-Zinn（乔·卡巴金）', difficulty: 'hard', tags: ['正念', 'MBSR'] },
    // 金門語
    { cat: '金門語', title: '金門語系', content: '金門語與下列哪個地區的方言最為接近？', type: 'multiple_choice', options: [{ text: '廈門', isCorrect: true }, { text: '潮州', isCorrect: false }, { text: '福州', isCorrect: false }, { text: '客家', isCorrect: false }], correctAnswer: '廈門', difficulty: 'medium', tags: ['金門語', '語言學'] },
    { cat: '金門語', title: '金門地理', content: '金門縣位於福建省外海。', type: 'true_false', correctAnswer: 'true', difficulty: 'easy', tags: ['金門', '地理'] },
    { cat: '金門語', title: '金門特產', content: '請列舉兩項金門著名特產。', type: 'short_answer', correctAnswer: '貢糖、高粱酒', difficulty: 'easy', tags: ['金門', '文化'] },
    // 泰雅族語
    { cat: '泰雅族語', title: '泰雅族分布', content: '泰雅族主要分布在台灣的哪個地區？', type: 'multiple_choice', options: [{ text: '北部及中部山區', isCorrect: true }, { text: '南部平原', isCorrect: false }, { text: '東部海岸', isCorrect: false }, { text: '離島地區', isCorrect: false }], correctAnswer: '北部及中部山區', difficulty: 'easy', tags: ['泰雅族', '地理'] },
    { cat: '泰雅族語', title: '泰雅族語系', content: '泰雅族語屬於南島語系。', type: 'true_false', correctAnswer: 'true', difficulty: 'easy', tags: ['泰雅族語', '語言學'] },
    { cat: '泰雅族語', title: 'Gaga 文化', content: '泰雅族的「Gaga」是指什麼？', type: 'multiple_choice', options: [{ text: '祖先遺訓/社會規範', isCorrect: true }, { text: '一種食物', isCorrect: false }, { text: '狩獵工具', isCorrect: false }, { text: '舞蹈名稱', isCorrect: false }], correctAnswer: '祖先遺訓/社會規範', difficulty: 'medium', tags: ['泰雅族', '文化'] },
    { cat: '泰雅族語', title: '泰雅族問候', content: '請寫出泰雅族語「謝謝」的說法。', type: 'short_answer', correctAnswer: 'mhway su', difficulty: 'medium', tags: ['泰雅族語', '詞彙'] },
  ];

  const qItems = questionData.map(q => {
    const qId = generateId('q');
    const cat = categories.find(c => c.name === q.cat);
    const item = {
      PK: `Q#${qId}`,
      SK: 'META',
      entityType: 'QUESTIONS',
      id: qId,
      type: q.type,
      title: q.title,
      content: q.content,
      correctAnswer: q.correctAnswer,
      points: 10,
      difficulty: q.difficulty,
      categoryId: cat.id,
      tags: q.tags,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };
    if (q.options) {
      item.options = q.options.map((opt, i) => ({ id: `opt_${i}`, text: opt.text, isCorrect: opt.isCorrect }));
    }
    if (q.type === 'short_answer') {
      item.sampleAnswer = q.correctAnswer;
    }
    return item;
  });

  // 更新類別的 questionCount
  catItems.forEach(cat => {
    cat.questionCount = qItems.filter(q => q.categoryId === cat.id).length;
  });

  return [...catItems, ...qItems];
}

// ─── Step 5: 建立討論區 ───

function getForums(courseId, courseTitle, userId, userName, now) {
  const data = {
    german: [
      {
        title: '課程公告',
        desc: '老師發布課程相關公告與重要通知。',
        type: 'news',
        discussions: [
          { title: '歡迎來到德語課！', content: '各位同學好！歡迎來到泰山高中德語課。本課程將帶領大家認識德語的基礎知識，包括發音、詞彙、文法和日常對話。請大家先到「學習平台」瀏覽課程資料，有任何問題隨時在討論區提問！', pinned: true },
          { title: '第一週作業說明', content: '第一週的作業「德語自我介紹寫作」已發布，請同學們在期限內完成。記得使用正確的德語語法，如果有不確定的地方，可以參考課程中的文法講義或在討論區提問。' },
        ],
      },
      {
        title: '德語學習討論',
        desc: '分享學習心得、提問德語問題、討論文法疑惑。',
        type: 'general',
        discussions: [
          { title: '德語發音有什麼訣竅嗎？', content: '我覺得德語的 R 音和 ch 音好難發，有同學有什麼練習訣竅可以分享的嗎？' },
        ],
      },
    ],
    mindful: [
      {
        title: '課程公告',
        desc: '課程最新消息與通知。',
        type: 'news',
        discussions: [
          { title: '歡迎加入心靈成長課程', content: '親愛的同學們，歡迎加入「心靈成長 Mindful Minds」課程！在這個課程中，我們將一起探索正念冥想、情緒覺察和心靈成長的方法。請先觀看課程中的正念冥想入門影片，為我們的學習之旅做好準備。🧘', pinned: true },
        ],
      },
      {
        title: '冥想練習交流',
        desc: '分享冥想練習的心得與體會。',
        type: 'general',
        discussions: [
          { title: '第一次冥想的感覺', content: '今天第一次嘗試了 10 分鐘的呼吸觀察冥想，發現自己的思緒真的很容易飄走 😅 但是每次把注意力拉回呼吸的時候，都感覺蠻平靜的。大家有類似的經驗嗎？' },
          { title: '推薦好用的冥想 App', content: '想請問有沒有同學有推薦的冥想輔助 App？最好是有中文引導的。' },
        ],
      },
    ],
    kinmen: [
      {
        title: '課程公告',
        desc: '金門語課程公告與通知。',
        type: 'news',
        discussions: [
          { title: '金門語課程開始啦！', content: '歡迎大家加入金門語課程！金門語是一種珍貴的閩南語方言，有著獨特的發音和用語。我們將透過互動學習平台來認識金門的語言與文化。請大家先到學習平台熟悉操作介面。', pinned: true },
        ],
      },
      {
        title: '金門文化交流',
        desc: '分享金門語學習心得、文化故事與在地知識。',
        type: 'general',
        discussions: [
          { title: '金門語和台灣閩南語有什麼不同？', content: '想請教老師和同學們，金門語跟我們一般說的台灣閩南語有什麼主要的差異呢？是發音不同還是用詞不同？' },
        ],
      },
    ],
    atayal: [
      {
        title: '課程公告',
        desc: '泰雅族語教學課程公告。',
        type: 'news',
        discussions: [
          { title: 'Lokah su！歡迎來到泰雅族語課程', content: 'Lokah su！（你好！）歡迎大家加入泰雅族語教學課程。泰雅族是台灣原住民族中分布最廣的族群之一，擁有豐富的語言和文化。我們將一起學習泰雅族語的基礎詞彙、日常對話，並認識泰雅族的文化故事。請大家先到學習平台開始探索！', pinned: true },
        ],
      },
      {
        title: '族語學習園地',
        desc: '交流泰雅族語學習心得，提問族語問題。',
        type: 'general',
        discussions: [
          { title: '泰雅族語的發音系統', content: '剛開始學泰雅族語，發現它的子音系統跟中文很不一樣。特別是那些喉音和擦音，有同學有好的記憶或練習方法嗎？' },
          { title: '推薦泰雅族文化相關的書籍或影片', content: '想更深入了解泰雅族的文化，除了課程平台之外，有沒有推薦的書籍、紀錄片或網站可以參考？' },
        ],
      },
    ],
  };

  const items = [];
  const courseData = data[COURSES.find(c => c.courseId === courseId).short];

  for (const forum of courseData) {
    const forumId = generateId('forum');

    // Forum record
    items.push({
      PK: `FORUM#${forumId}`,
      SK: 'META',
      entityType: 'FORUM',
      GSI1PK: `COURSE#${courseId}`,
      GSI1SK: `FORUM#${forumId}`,
      forumId,
      courseId,
      title: forum.title,
      description: forum.desc,
      type: forum.type,
      forumMode: 'standard',
      subscriptionMode: 'optional',
      ratingEnabled: false,
      maxAttachments: 5,
      maxAttachmentSize: 10,
      visible: true,
      discussionCount: forum.discussions.length,
      postCount: forum.discussions.length,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    for (const disc of forum.discussions) {
      const discussionId = generateId('disc');

      // Discussion META
      items.push({
        PK: `DISCUSSION#${discussionId}`,
        SK: 'META',
        entityType: 'DISCUSSION',
        discussionId,
        forumId,
        courseId,
        title: disc.title,
        content: disc.content,
        authorId: userId,
        authorName: userName,
        authorRole: 'instructor',
        pinned: disc.pinned || false,
        locked: false,
        viewCount: 0,
        replyCount: 0,
        createdAt: now,
        updatedAt: now,
      });

      // Forum → Discussion reference
      items.push({
        PK: `FORUM#${forumId}`,
        SK: `DISCUSSION#${discussionId}`,
        entityType: 'FORUM_DISCUSSION',
        discussionId,
        forumId,
        title: disc.title,
        authorId: userId,
        authorName: userName,
        pinned: disc.pinned || false,
        replyCount: 0,
        createdAt: now,
      });
    }
  }

  return items;
}

// ─── Main ───

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  課程內容填充：作業、測驗、題庫、討論區     ║');
  console.log('╚══════════════════════════════════════════╝');

  const teacher = await getUserByEmail('demo@beyondbridge.com');
  if (!teacher) { console.error('找不到老師'); process.exit(1); }
  const userId = teacher.userId || teacher.PK?.replace('USER#', '');
  const userName = teacher.displayName || 'Demo Teacher';
  console.log(`\n  ✓ 老師: ${userName} (${userId})`);

  // Step 1: 清除舊資料
  await cleanOldData();

  const now = new Date().toISOString();
  let totalCreated = 0;

  for (const course of COURSES) {
    console.log(`📚 ${course.title}`);

    // 作業
    const assignments = getAssignments(course.courseId, course.title, userId, now);
    for (const a of assignments) await putItem(a);
    console.log(`   ✓ ${assignments.length} 份作業`);
    totalCreated += assignments.length;

    // 測驗
    const quizzes = getQuizzes(course.courseId, course.title, userId, now);
    for (const q of quizzes) await putItem(q);
    console.log(`   ✓ ${quizzes.length} 份測驗`);
    totalCreated += quizzes.length;

    // 討論區
    const forums = getForums(course.courseId, course.title, userId, userName, now);
    for (const f of forums) await putItem(f);
    const forumCount = forums.filter(f => f.entityType === 'FORUM').length;
    const discCount = forums.filter(f => f.entityType === 'DISCUSSION').length;
    console.log(`   ✓ ${forumCount} 個討論區, ${discCount} 篇討論`);
    totalCreated += forums.length;

    console.log('');
  }

  // 題庫（全域共用）
  console.log('📋 題庫');
  const qbItems = getQuestionBank(userId, now);
  for (const q of qbItems) await putItem(q);
  const catCount = qbItems.filter(q => q.entityType === 'QUESTION_CATEGORIES').length;
  const qCount = qbItems.filter(q => q.entityType === 'QUESTIONS').length;
  console.log(`   ✓ ${catCount} 個類別, ${qCount} 道題目`);
  totalCreated += qbItems.length;

  console.log('\n════════════════════════════════════════════');
  console.log(`✅ 完成！共建立 ${totalCreated} 筆資料`);
  console.log('════════════════════════════════════════════\n');
}

main().catch(err => { console.error('❌ 失敗:', err); process.exit(1); });
