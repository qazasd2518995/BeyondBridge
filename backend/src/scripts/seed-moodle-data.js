/**
 * 初始化 Moodle 功能測試資料
 * 執行方式: node src/scripts/seed-moodle-data.js
 */

require('dotenv').config();
const db = require('../utils/db');

const now = new Date().toISOString();

// 示範課程資料
const demoCourses = [
  {
    PK: 'COURSE#crs_demo001',
    SK: 'META',
    entityType: 'COURSE',
    courseId: 'crs_demo001',
    title: '網頁開發入門',
    shortName: 'WEB101',
    description: '從零開始學習 HTML、CSS 和 JavaScript，建立互動式網頁。本課程適合完全沒有程式經驗的初學者。',
    category: 'technology',
    status: 'published',
    visibility: 'public',
    instructorId: 'usr_demo_teacher',
    instructorName: '李教授',
    thumbnail: '/images/courses/web-dev.jpg',
    duration: '8 週',
    level: 'beginner',
    tags: ['HTML', 'CSS', 'JavaScript', '網頁設計'],
    enrollmentCount: 156,
    rating: 4.8,
    format: 'topics',
    sections: [
      { id: 'sec_1', title: '課程介紹', order: 1 },
      { id: 'sec_2', title: 'HTML 基礎', order: 2 },
      { id: 'sec_3', title: 'CSS 樣式設計', order: 3 },
      { id: 'sec_4', title: 'JavaScript 入門', order: 4 }
    ],
    createdAt: now,
    updatedAt: now
  },
  {
    PK: 'COURSE#crs_demo002',
    SK: 'META',
    entityType: 'COURSE',
    courseId: 'crs_demo002',
    title: '資料科學與機器學習',
    shortName: 'DS201',
    description: '深入了解資料分析、視覺化和機器學習演算法。使用 Python 實作各種 ML 模型。',
    category: 'technology',
    status: 'published',
    visibility: 'public',
    instructorId: 'usr_demo_teacher',
    instructorName: '李教授',
    thumbnail: '/images/courses/data-science.jpg',
    duration: '12 週',
    level: 'intermediate',
    tags: ['Python', '機器學習', '資料分析', 'AI'],
    enrollmentCount: 89,
    rating: 4.6,
    format: 'weeks',
    sections: [
      { id: 'sec_1', title: '第 1 週：Python 資料處理', order: 1 },
      { id: 'sec_2', title: '第 2 週：資料視覺化', order: 2 },
      { id: 'sec_3', title: '第 3 週：機器學習概論', order: 3 }
    ],
    createdAt: now,
    updatedAt: now
  },
  {
    PK: 'COURSE#crs_demo003',
    SK: 'META',
    entityType: 'COURSE',
    courseId: 'crs_demo003',
    title: '商業英文溝通技巧',
    shortName: 'ENG301',
    description: '提升職場英文能力，包含商業書信撰寫、會議主持和簡報技巧。',
    category: 'language',
    status: 'published',
    visibility: 'public',
    instructorId: 'usr_demo_teacher2',
    instructorName: '王老師',
    thumbnail: '/images/courses/business-english.jpg',
    duration: '6 週',
    level: 'intermediate',
    tags: ['英文', '商業溝通', '簡報技巧'],
    enrollmentCount: 234,
    rating: 4.9,
    format: 'topics',
    sections: [
      { id: 'sec_1', title: '商業書信撰寫', order: 1 },
      { id: 'sec_2', title: '會議英文', order: 2 },
      { id: 'sec_3', title: '簡報技巧', order: 3 }
    ],
    createdAt: now,
    updatedAt: now
  }
];

// 示範作業資料
const demoAssignments = [
  {
    PK: 'ASSIGNMENT#asgn_demo001',
    SK: 'META',
    entityType: 'ASSIGNMENT',
    assignmentId: 'asgn_demo001',
    courseId: 'crs_demo001',
    courseName: '網頁開發入門',
    title: '個人網頁專題',
    description: '設計並實作一個個人介紹網頁，需包含：首頁、關於我、作品集和聯絡資訊四個頁面。',
    instructions: `## 作業要求

1. **首頁 (index.html)**
   - 包含導覽列
   - 簡短自我介紹
   - 吸引人的視覺設計

2. **關於我頁面**
   - 詳細的個人背景
   - 學習歷程
   - 興趣愛好

3. **作品集頁面**
   - 至少展示 3 個作品
   - 每個作品需有標題和描述

4. **聯絡資訊頁面**
   - 聯絡表單
   - 社群媒體連結

## 評分標準
- HTML 結構正確性 (25%)
- CSS 樣式設計 (25%)
- 響應式設計 (20%)
- 創意與美觀 (20%)
- 程式碼品質 (10%)`,
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    allowLateSubmissions: true,
    latePenalty: 10,
    maxScore: 100,
    passingScore: 60,
    submissionType: 'file',
    allowedFileTypes: ['.html', '.css', '.js', '.zip'],
    maxFileSize: 10485760,
    status: 'open',
    createdAt: now,
    updatedAt: now
  },
  {
    PK: 'ASSIGNMENT#asgn_demo002',
    SK: 'META',
    entityType: 'ASSIGNMENT',
    assignmentId: 'asgn_demo002',
    courseId: 'crs_demo002',
    courseName: '資料科學與機器學習',
    title: '資料視覺化報告',
    description: '使用 Python 分析提供的資料集，並製作視覺化報告。',
    instructions: `## 作業說明

請下載課程提供的銷售資料集，完成以下任務：

1. 資料清理與預處理
2. 探索性資料分析 (EDA)
3. 製作至少 5 種不同類型的圖表
4. 撰寫分析報告

## 繳交格式
- Jupyter Notebook (.ipynb)
- PDF 報告`,
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    allowLateSubmissions: false,
    maxScore: 100,
    passingScore: 70,
    submissionType: 'file',
    allowedFileTypes: ['.ipynb', '.pdf', '.zip'],
    maxFileSize: 52428800,
    status: 'open',
    createdAt: now,
    updatedAt: now
  },
  {
    PK: 'ASSIGNMENT#asgn_demo003',
    SK: 'META',
    entityType: 'ASSIGNMENT',
    assignmentId: 'asgn_demo003',
    courseId: 'crs_demo003',
    courseName: '商業英文溝通技巧',
    title: '商業簡報練習',
    description: '準備一個 5 分鐘的商業簡報，主題自選，需使用英文呈現。',
    instructions: `## 簡報要求

1. **時間**: 5-7 分鐘
2. **語言**: 全程英文
3. **內容**: 商業相關主題（產品介紹、市場分析、專案提案等）

## 評分項目
- 內容結構 (30%)
- 英文表達 (30%)
- 簡報技巧 (25%)
- 視覺呈現 (15%)

## 繳交方式
上傳簡報檔案 (PPT/PDF) 及錄影檔案`,
    dueDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
    allowLateSubmissions: true,
    latePenalty: 5,
    maxScore: 100,
    passingScore: 60,
    submissionType: 'file',
    allowedFileTypes: ['.pptx', '.pdf', '.mp4', '.zip'],
    maxFileSize: 104857600,
    status: 'open',
    createdAt: now,
    updatedAt: now
  }
];

// 示範討論區資料
const demoForums = [
  {
    PK: 'FORUM#forum_demo001',
    SK: 'META',
    entityType: 'FORUM',
    forumId: 'forum_demo001',
    courseId: 'crs_demo001',
    courseName: '網頁開發入門',
    title: '課程問答區',
    description: '有任何關於課程內容的問題都可以在這裡發問！',
    type: 'general',
    postCount: 23,
    lastPostAt: now,
    createdAt: now,
    updatedAt: now
  },
  {
    PK: 'FORUM#forum_demo002',
    SK: 'META',
    entityType: 'FORUM',
    forumId: 'forum_demo002',
    courseId: 'crs_demo001',
    courseName: '網頁開發入門',
    title: '作品分享區',
    description: '分享你的網頁作品，互相學習交流！',
    type: 'blog',
    postCount: 15,
    lastPostAt: now,
    createdAt: now,
    updatedAt: now
  },
  {
    PK: 'FORUM#forum_demo003',
    SK: 'META',
    entityType: 'FORUM',
    forumId: 'forum_demo003',
    courseId: 'crs_demo002',
    courseName: '資料科學與機器學習',
    title: '學習討論區',
    description: '討論機器學習概念、分享學習心得',
    type: 'general',
    postCount: 42,
    lastPostAt: now,
    createdAt: now,
    updatedAt: now
  }
];

// 示範測驗資料
const demoQuizzes = [
  {
    PK: 'QUIZ#quiz_demo001',
    SK: 'META',
    entityType: 'QUIZ',
    quizId: 'quiz_demo001',
    courseId: 'crs_demo001',
    courseName: '網頁開發入門',
    title: 'HTML 基礎測驗',
    description: '測試你對 HTML 標籤和結構的理解',
    instructions: '本測驗共 5 題，時間限制 20 分鐘。每題 20 分，及格分數 60 分。',
    timeLimit: 20,
    maxAttempts: 3,
    shuffleQuestions: true,
    shuffleAnswers: true,
    showResults: 'immediately',
    passingScore: 60,
    maxScore: 100,
    questionCount: 5,
    questions: [
      {
        questionId: 'q_html001',
        order: 1,
        type: 'multiple_choice',
        text: 'HTML 中哪個標籤用於定義網頁的標題？',
        points: 20,
        options: ['<header>', '<title>', '<h1>', '<head>'],
        correctAnswer: 1
      },
      {
        questionId: 'q_html002',
        order: 2,
        type: 'multiple_choice',
        text: '以下哪個是正確的 HTML5 文件宣告？',
        points: 20,
        options: ['<!DOCTYPE HTML5>', '<!DOCTYPE html>', '<DOCTYPE html>', '<!html>'],
        correctAnswer: 1
      },
      {
        questionId: 'q_html003',
        order: 3,
        type: 'multiple_choice',
        text: '在 HTML 中，<a> 標籤的 href 屬性用於什麼？',
        points: 20,
        options: ['設定文字顏色', '指定連結目標', '設定字體大小', '設定圖片來源'],
        correctAnswer: 1
      },
      {
        questionId: 'q_html004',
        order: 4,
        type: 'true_false',
        text: '<br> 標籤需要閉合標籤',
        points: 20,
        correctAnswer: false
      },
      {
        questionId: 'q_html005',
        order: 5,
        type: 'multiple_choice',
        text: '哪個 HTML 元素用於定義無序列表？',
        points: 20,
        options: ['<ol>', '<li>', '<ul>', '<list>'],
        correctAnswer: 2
      }
    ],
    status: 'published',
    openDate: now,
    closeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now,
    updatedAt: now
  },
  {
    PK: 'QUIZ#quiz_demo002',
    SK: 'META',
    entityType: 'QUIZ',
    quizId: 'quiz_demo002',
    courseId: 'crs_demo001',
    courseName: '網頁開發入門',
    title: 'CSS 樣式設計測驗',
    description: '測試你對 CSS 選擇器、屬性和佈局的掌握程度',
    instructions: '本測驗共 5 題，時間限制 30 分鐘。',
    timeLimit: 30,
    maxAttempts: 2,
    shuffleQuestions: true,
    shuffleAnswers: true,
    showResults: 'after_close',
    passingScore: 70,
    maxScore: 100,
    questionCount: 5,
    questions: [
      {
        questionId: 'q_css001',
        order: 1,
        type: 'multiple_choice',
        text: 'CSS 的全名是什麼？',
        points: 20,
        options: ['Creative Style Sheets', 'Cascading Style Sheets', 'Computer Style Sheets', 'Colorful Style Sheets'],
        correctAnswer: 1
      },
      {
        questionId: 'q_css002',
        order: 2,
        type: 'multiple_choice',
        text: '如何選擇所有 class 為 "intro" 的元素？',
        points: 20,
        options: ['#intro', '.intro', 'intro', '*intro'],
        correctAnswer: 1
      },
      {
        questionId: 'q_css003',
        order: 3,
        type: 'multiple_choice',
        text: '以下哪個屬性用於改變文字顏色？',
        points: 20,
        options: ['text-color', 'font-color', 'color', 'text-style'],
        correctAnswer: 2
      },
      {
        questionId: 'q_css004',
        order: 4,
        type: 'true_false',
        text: 'CSS 中 padding 屬性用於設定元素的外邊距',
        points: 20,
        correctAnswer: false
      },
      {
        questionId: 'q_css005',
        order: 5,
        type: 'multiple_choice',
        text: 'Flexbox 中，justify-content 屬性用於控制什麼？',
        points: 20,
        options: ['垂直對齊', '主軸對齊', '字體大小', '背景顏色'],
        correctAnswer: 1
      }
    ],
    status: 'published',
    openDate: now,
    closeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now,
    updatedAt: now
  },
  {
    PK: 'QUIZ#quiz_demo003',
    SK: 'META',
    entityType: 'QUIZ',
    quizId: 'quiz_demo003',
    courseId: 'crs_demo002',
    courseName: '資料科學與機器學習',
    title: 'Python 基礎測驗',
    description: '測試 Python 程式設計基礎知識',
    instructions: '本測驗共 5 題，時間限制 40 分鐘。',
    timeLimit: 40,
    maxAttempts: 1,
    shuffleQuestions: false,
    shuffleAnswers: true,
    showResults: 'immediately',
    passingScore: 60,
    maxScore: 100,
    questionCount: 5,
    questions: [
      {
        questionId: 'q_py001',
        order: 1,
        type: 'multiple_choice',
        text: 'Python 中用於輸出的函數是？',
        points: 20,
        options: ['echo()', 'printf()', 'print()', 'console.log()'],
        correctAnswer: 2
      },
      {
        questionId: 'q_py002',
        order: 2,
        type: 'multiple_choice',
        text: '在 Python 中，如何定義一個列表？',
        points: 20,
        options: ['(1, 2, 3)', '[1, 2, 3]', '{1, 2, 3}', '<1, 2, 3>'],
        correctAnswer: 1
      },
      {
        questionId: 'q_py003',
        order: 3,
        type: 'multiple_choice',
        text: 'Python 中用於定義函數的關鍵字是？',
        points: 20,
        options: ['function', 'def', 'func', 'define'],
        correctAnswer: 1
      },
      {
        questionId: 'q_py004',
        order: 4,
        type: 'true_false',
        text: 'Python 使用大括號 {} 來定義程式碼區塊',
        points: 20,
        correctAnswer: false
      },
      {
        questionId: 'q_py005',
        order: 5,
        type: 'multiple_choice',
        text: '以下哪個是 Python 的資料類型？',
        points: 20,
        options: ['integer', 'char', 'int', 'long'],
        correctAnswer: 2
      }
    ],
    status: 'published',
    openDate: now,
    closeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now,
    updatedAt: now
  }
];

// 示範成績簿資料
const demoGrades = [
  {
    PK: 'USER#usr_demo001',
    SK: 'GRADE#crs_demo001#asgn_demo001',
    entityType: 'GRADE',
    userId: 'usr_demo001',
    courseId: 'crs_demo001',
    itemId: 'asgn_demo001',
    itemType: 'assignment',
    itemName: '個人網頁專題',
    score: 85,
    maxScore: 100,
    percentage: 85,
    feedback: '設計美觀，結構清晰。建議可以增加更多互動效果。',
    gradedAt: now,
    gradedBy: 'usr_demo_teacher'
  },
  {
    PK: 'USER#usr_demo001',
    SK: 'GRADE#crs_demo001#quiz_demo001',
    entityType: 'GRADE',
    userId: 'usr_demo001',
    courseId: 'crs_demo001',
    itemId: 'quiz_demo001',
    itemType: 'quiz',
    itemName: 'HTML 基礎測驗',
    score: 90,
    maxScore: 100,
    percentage: 90,
    gradedAt: now
  }
];

// 示範行事曆事件
const demoCalendarEvents = [
  {
    PK: 'CALENDAR#evt_demo001',
    SK: 'META',
    entityType: 'CALENDAR_EVENT',
    eventId: 'evt_demo001',
    title: '網頁開發入門 - 線上直播課程',
    description: '本週將介紹 CSS Grid 和 Flexbox 佈局技巧',
    eventType: 'course',
    courseId: 'crs_demo001',
    courseName: '網頁開發入門',
    startDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
    location: 'Zoom 會議室',
    createdAt: now
  },
  {
    PK: 'CALENDAR#evt_demo002',
    SK: 'META',
    entityType: 'CALENDAR_EVENT',
    eventId: 'evt_demo002',
    title: '個人網頁專題繳交截止',
    description: '請確保在截止日期前完成繳交',
    eventType: 'assignment',
    courseId: 'crs_demo001',
    courseName: '網頁開發入門',
    assignmentId: 'asgn_demo001',
    startDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now
  },
  {
    PK: 'CALENDAR#evt_demo003',
    SK: 'META',
    entityType: 'CALENDAR_EVENT',
    eventId: 'evt_demo003',
    title: 'HTML 基礎測驗開放',
    description: '測驗將於今天開放，請在期限內完成',
    eventType: 'quiz',
    courseId: 'crs_demo001',
    courseName: '網頁開發入門',
    quizId: 'quiz_demo001',
    startDate: now,
    createdAt: now
  }
];

// 示範通知資料
const demoNotifications = [
  {
    PK: 'USER#usr_demo001',
    SK: `NOTIF#${now}#notif_001`,
    entityType: 'NOTIFICATION',
    notificationId: 'notif_001',
    userId: 'usr_demo001',
    title: '新作業發布',
    message: '網頁開發入門課程發布了新作業「個人網頁專題」',
    type: 'assignment',
    courseId: 'crs_demo001',
    courseName: '網頁開發入門',
    link: '/assignments/asgn_demo001',
    isRead: false,
    createdAt: now
  },
  {
    PK: 'USER#usr_demo001',
    SK: `NOTIF#${new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()}#notif_002`,
    entityType: 'NOTIFICATION',
    notificationId: 'notif_002',
    userId: 'usr_demo001',
    title: '測驗成績發布',
    message: '你在 HTML 基礎測驗獲得 90 分！',
    type: 'grade',
    courseId: 'crs_demo001',
    courseName: '網頁開發入門',
    link: '/gradebook',
    isRead: true,
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    PK: 'USER#usr_demo001',
    SK: `NOTIF#${new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()}#notif_003`,
    entityType: 'NOTIFICATION',
    notificationId: 'notif_003',
    userId: 'usr_demo001',
    title: '討論區有新回覆',
    message: '李教授回覆了你在「課程問答區」的問題',
    type: 'forum',
    courseId: 'crs_demo001',
    courseName: '網頁開發入門',
    link: '/forums/forum_demo001',
    isRead: false,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  }
];

// 學生課程進度
const demoCourseProgress = [
  {
    PK: 'USER#usr_demo001',
    SK: 'PROG#COURSE#crs_demo001',
    entityType: 'COURSE_PROGRESS',
    userId: 'usr_demo001',
    courseId: 'crs_demo001',
    status: 'in_progress',
    progressPercentage: 45,
    completedUnits: ['sec_1', 'sec_2'],
    currentUnit: 'sec_3',
    totalTimeSpent: 7200,
    lastAccessedAt: now,
    enrolledAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    PK: 'USER#usr_demo001',
    SK: 'PROG#COURSE#crs_demo002',
    entityType: 'COURSE_PROGRESS',
    userId: 'usr_demo001',
    courseId: 'crs_demo002',
    status: 'in_progress',
    progressPercentage: 20,
    completedUnits: ['sec_1'],
    currentUnit: 'sec_2',
    totalTimeSpent: 3600,
    lastAccessedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    enrolledAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  }
];

async function seedData() {
  console.log('開始初始化 Moodle 測試資料...\n');

  try {
    // 插入課程
    console.log('📚 插入課程資料...');
    for (const course of demoCourses) {
      await db.putItem(course);
      console.log(`  ✓ ${course.title}`);
    }

    // 插入作業
    console.log('\n📝 插入作業資料...');
    for (const assignment of demoAssignments) {
      await db.putItem(assignment);
      console.log(`  ✓ ${assignment.title}`);
    }

    // 插入討論區
    console.log('\n💬 插入討論區資料...');
    for (const forum of demoForums) {
      await db.putItem(forum);
      console.log(`  ✓ ${forum.title}`);
    }

    // 插入測驗
    console.log('\n📋 插入測驗資料...');
    for (const quiz of demoQuizzes) {
      await db.putItem(quiz);
      console.log(`  ✓ ${quiz.title}`);
    }

    // 插入成績
    console.log('\n📊 插入成績資料...');
    for (const grade of demoGrades) {
      await db.putItem(grade);
      console.log(`  ✓ ${grade.itemName}: ${grade.score}/${grade.maxScore}`);
    }

    // 插入行事曆事件
    console.log('\n📅 插入行事曆事件...');
    for (const event of demoCalendarEvents) {
      await db.putItem(event);
      console.log(`  ✓ ${event.title}`);
    }

    // 插入通知
    console.log('\n🔔 插入通知資料...');
    for (const notification of demoNotifications) {
      await db.putItem(notification);
      console.log(`  ✓ ${notification.title}`);
    }

    // 插入課程進度
    console.log('\n📈 插入課程進度資料...');
    for (const progress of demoCourseProgress) {
      await db.putItem(progress);
      console.log(`  ✓ 課程 ${progress.courseId}: ${progress.progressPercentage}%`);
    }

    console.log('\n✅ 所有測試資料初始化完成！');
    console.log('\n統計:');
    console.log(`  - 課程: ${demoCourses.length}`);
    console.log(`  - 作業: ${demoAssignments.length}`);
    console.log(`  - 討論區: ${demoForums.length}`);
    console.log(`  - 測驗: ${demoQuizzes.length}`);
    console.log(`  - 成績記錄: ${demoGrades.length}`);
    console.log(`  - 行事曆事件: ${demoCalendarEvents.length}`);
    console.log(`  - 通知: ${demoNotifications.length}`);
    console.log(`  - 課程進度: ${demoCourseProgress.length}`);

  } catch (error) {
    console.error('初始化失敗:', error);
    process.exit(1);
  }
}

seedData();
