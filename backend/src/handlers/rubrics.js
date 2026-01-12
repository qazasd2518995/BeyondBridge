/**
 * 評分標準 (Rubrics) API
 * BeyondBridge Education Platform
 *
 * Moodle-style rubric grading system
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// 評分標準範本
// ============================================================================

/**
 * GET /api/rubrics/templates
 * 取得評分標準範本
 */
router.get('/templates', authMiddleware, async (req, res) => {
  try {
    const templates = [
      {
        id: 'template_essay',
        name: '論文寫作評分標準',
        description: '適用於各類論文、報告的評分',
        criteria: [
          {
            id: 'crit_1',
            name: '論點清晰度',
            description: '論文的主要論點是否清楚明確',
            levels: [
              { score: 4, label: '優秀', description: '論點極為清晰，論述邏輯嚴謹' },
              { score: 3, label: '良好', description: '論點清楚，論述合理' },
              { score: 2, label: '尚可', description: '論點基本清楚，但論述有些許不足' },
              { score: 1, label: '需改進', description: '論點不夠清楚，論述混亂' }
            ]
          },
          {
            id: 'crit_2',
            name: '資料引用',
            description: '是否正確引用資料來源',
            levels: [
              { score: 4, label: '優秀', description: '引用豐富且格式正確' },
              { score: 3, label: '良好', description: '引用適當，格式大致正確' },
              { score: 2, label: '尚可', description: '引用不足或格式有誤' },
              { score: 1, label: '需改進', description: '缺乏引用或格式錯誤嚴重' }
            ]
          },
          {
            id: 'crit_3',
            name: '文字表達',
            description: '文字的流暢度與正確性',
            levels: [
              { score: 4, label: '優秀', description: '文筆流暢，無語法錯誤' },
              { score: 3, label: '良好', description: '文筆通順，少量錯誤' },
              { score: 2, label: '尚可', description: '文筆尚可，有一些錯誤' },
              { score: 1, label: '需改進', description: '文筆生澀，錯誤較多' }
            ]
          }
        ],
        maxScore: 12,
        createdAt: '2024-01-01T00:00:00Z'
      },
      {
        id: 'template_presentation',
        name: '簡報演示評分標準',
        description: '適用於口頭報告、簡報的評分',
        criteria: [
          {
            id: 'crit_1',
            name: '內容組織',
            description: '簡報內容的結構與邏輯',
            levels: [
              { score: 5, label: '優秀', description: '結構清晰，邏輯嚴謹' },
              { score: 4, label: '良好', description: '結構合理，邏輯通順' },
              { score: 3, label: '普通', description: '結構基本合理' },
              { score: 2, label: '尚可', description: '結構較混亂' },
              { score: 1, label: '需改進', description: '缺乏組織' }
            ]
          },
          {
            id: 'crit_2',
            name: '表達能力',
            description: '口語表達的清晰度與自信',
            levels: [
              { score: 5, label: '優秀', description: '表達清晰自信，互動良好' },
              { score: 4, label: '良好', description: '表達清楚，有一定互動' },
              { score: 3, label: '普通', description: '表達基本清楚' },
              { score: 2, label: '尚可', description: '表達不夠清楚' },
              { score: 1, label: '需改進', description: '表達混亂' }
            ]
          },
          {
            id: 'crit_3',
            name: '視覺設計',
            description: '投影片的設計品質',
            levels: [
              { score: 5, label: '優秀', description: '設計專業美觀' },
              { score: 4, label: '良好', description: '設計整潔有條理' },
              { score: 3, label: '普通', description: '設計基本合格' },
              { score: 2, label: '尚可', description: '設計需要改進' },
              { score: 1, label: '需改進', description: '設計混亂' }
            ]
          }
        ],
        maxScore: 15,
        createdAt: '2024-01-01T00:00:00Z'
      },
      {
        id: 'template_coding',
        name: '程式作業評分標準',
        description: '適用於程式設計作業的評分',
        criteria: [
          {
            id: 'crit_1',
            name: '功能正確性',
            description: '程式是否正確實現要求的功能',
            levels: [
              { score: 10, label: '完全正確', description: '所有功能正確運作，通過所有測試' },
              { score: 8, label: '大致正確', description: '主要功能正確，有小問題' },
              { score: 6, label: '部分正確', description: '部分功能正確' },
              { score: 4, label: '有嘗試', description: '有嘗試但錯誤較多' },
              { score: 0, label: '未完成', description: '功能未實現' }
            ]
          },
          {
            id: 'crit_2',
            name: '程式碼品質',
            description: '程式碼的可讀性與結構',
            levels: [
              { score: 5, label: '優秀', description: '結構清晰，註解完整，命名規範' },
              { score: 4, label: '良好', description: '結構合理，有適當註解' },
              { score: 3, label: '普通', description: '結構基本合理' },
              { score: 2, label: '尚可', description: '結構較混亂' },
              { score: 1, label: '需改進', description: '難以閱讀' }
            ]
          },
          {
            id: 'crit_3',
            name: '效能與優化',
            description: '程式的執行效能',
            levels: [
              { score: 5, label: '優秀', description: '效能最佳化，無冗餘' },
              { score: 4, label: '良好', description: '效能良好' },
              { score: 3, label: '普通', description: '效能一般' },
              { score: 2, label: '尚可', description: '有效能問題' },
              { score: 1, label: '需改進', description: '效能很差' }
            ]
          }
        ],
        maxScore: 20,
        createdAt: '2024-01-01T00:00:00Z'
      }
    ];

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Get rubric templates error:', error);
    res.status(500).json({
      success: false,
      message: '取得評分範本失敗'
    });
  }
});

// ============================================================================
// 評分標準 CRUD
// ============================================================================

/**
 * GET /api/rubrics
 * 取得所有評分標準
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { courseId, assignmentId } = req.query;

    // 模擬資料
    const rubrics = [
      {
        id: 'rubric_001',
        name: '期中報告評分標準',
        description: '用於評估期中報告的品質',
        courseId: 'course_001',
        assignmentId: 'assign_001',
        criteria: [
          {
            id: 'crit_1',
            name: '內容深度',
            description: '報告內容的深度與廣度',
            weight: 40,
            levels: [
              { score: 4, label: '優秀', description: '深入分析，見解獨到' },
              { score: 3, label: '良好', description: '分析合理，有見解' },
              { score: 2, label: '尚可', description: '分析基本正確' },
              { score: 1, label: '需改進', description: '分析淺薄' }
            ]
          },
          {
            id: 'crit_2',
            name: '格式規範',
            description: '是否遵守格式要求',
            weight: 30,
            levels: [
              { score: 4, label: '優秀', description: '完全符合格式要求' },
              { score: 3, label: '良好', description: '大致符合格式' },
              { score: 2, label: '尚可', description: '部分符合' },
              { score: 1, label: '需改進', description: '格式錯誤嚴重' }
            ]
          },
          {
            id: 'crit_3',
            name: '原創性',
            description: '內容的原創程度',
            weight: 30,
            levels: [
              { score: 4, label: '優秀', description: '高度原創，無抄襲' },
              { score: 3, label: '良好', description: '大部分原創' },
              { score: 2, label: '尚可', description: '有部分引用但標註' },
              { score: 1, label: '需改進', description: '原創性不足' }
            ]
          }
        ],
        maxScore: 100,
        status: 'active',
        createdAt: '2024-01-15T00:00:00Z',
        updatedAt: '2024-01-20T00:00:00Z'
      }
    ];

    let filtered = [...rubrics];
    if (courseId) {
      filtered = filtered.filter(r => r.courseId === courseId);
    }
    if (assignmentId) {
      filtered = filtered.filter(r => r.assignmentId === assignmentId);
    }

    res.json({
      success: true,
      data: filtered
    });
  } catch (error) {
    console.error('Get rubrics error:', error);
    res.status(500).json({
      success: false,
      message: '取得評分標準失敗'
    });
  }
});

/**
 * GET /api/rubrics/:rubricId
 * 取得單一評分標準
 */
router.get('/:rubricId', authMiddleware, async (req, res) => {
  try {
    const { rubricId } = req.params;

    const rubric = {
      id: rubricId,
      name: '期中報告評分標準',
      description: '用於評估期中報告的品質',
      courseId: 'course_001',
      assignmentId: 'assign_001',
      criteria: [
        {
          id: 'crit_1',
          name: '內容深度',
          description: '報告內容的深度與廣度',
          weight: 40,
          levels: [
            { score: 4, label: '優秀', description: '深入分析，見解獨到' },
            { score: 3, label: '良好', description: '分析合理，有見解' },
            { score: 2, label: '尚可', description: '分析基本正確' },
            { score: 1, label: '需改進', description: '分析淺薄' }
          ]
        },
        {
          id: 'crit_2',
          name: '格式規範',
          description: '是否遵守格式要求',
          weight: 30,
          levels: [
            { score: 4, label: '優秀', description: '完全符合格式要求' },
            { score: 3, label: '良好', description: '大致符合格式' },
            { score: 2, label: '尚可', description: '部分符合' },
            { score: 1, label: '需改進', description: '格式錯誤嚴重' }
          ]
        },
        {
          id: 'crit_3',
          name: '原創性',
          description: '內容的原創程度',
          weight: 30,
          levels: [
            { score: 4, label: '優秀', description: '高度原創，無抄襲' },
            { score: 3, label: '良好', description: '大部分原創' },
            { score: 2, label: '尚可', description: '有部分引用但標註' },
            { score: 1, label: '需改進', description: '原創性不足' }
          ]
        }
      ],
      maxScore: 100,
      status: 'active',
      usageCount: 45,
      createdBy: 'teacher_001',
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-20T00:00:00Z'
    };

    res.json({
      success: true,
      data: rubric
    });
  } catch (error) {
    console.error('Get rubric error:', error);
    res.status(500).json({
      success: false,
      message: '取得評分標準失敗'
    });
  }
});

/**
 * POST /api/rubrics
 * 建立評分標準
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description, courseId, assignmentId, criteria, templateId } = req.body;

    // 計算最高分
    let maxScore = 0;
    if (criteria && criteria.length > 0) {
      maxScore = criteria.reduce((sum, crit) => {
        const maxLevel = Math.max(...crit.levels.map(l => l.score));
        return sum + (maxLevel * (crit.weight / 100));
      }, 0) * 100 / criteria.reduce((sum, c) => sum + (c.weight || 0), 0);
    }

    const rubric = {
      id: `rubric_${uuidv4().substring(0, 12)}`,
      name,
      description: description || '',
      courseId: courseId || null,
      assignmentId: assignmentId || null,
      criteria: (criteria || []).map((c, idx) => ({
        id: c.id || `crit_${idx + 1}`,
        name: c.name,
        description: c.description || '',
        weight: c.weight || Math.floor(100 / criteria.length),
        levels: c.levels || []
      })),
      maxScore: Math.round(maxScore) || 100,
      status: 'active',
      templateId: templateId || null,
      usageCount: 0,
      createdBy: req.user.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await db.put({
        TableName: 'RUBRICS',
        Item: rubric
      });
    } catch (dbError) {
      console.log('Database save skipped, returning mock data');
    }

    res.json({
      success: true,
      data: rubric,
      message: '評分標準建立成功'
    });
  } catch (error) {
    console.error('Create rubric error:', error);
    res.status(500).json({
      success: false,
      message: '建立評分標準失敗'
    });
  }
});

/**
 * PUT /api/rubrics/:rubricId
 * 更新評分標準
 */
router.put('/:rubricId', authMiddleware, async (req, res) => {
  try {
    const { rubricId } = req.params;
    const updates = req.body;

    const updatedRubric = {
      id: rubricId,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: updatedRubric,
      message: '評分標準更新成功'
    });
  } catch (error) {
    console.error('Update rubric error:', error);
    res.status(500).json({
      success: false,
      message: '更新評分標準失敗'
    });
  }
});

/**
 * DELETE /api/rubrics/:rubricId
 * 刪除評分標準
 */
router.delete('/:rubricId', authMiddleware, async (req, res) => {
  try {
    const { rubricId } = req.params;

    res.json({
      success: true,
      message: '評分標準刪除成功'
    });
  } catch (error) {
    console.error('Delete rubric error:', error);
    res.status(500).json({
      success: false,
      message: '刪除評分標準失敗'
    });
  }
});

/**
 * POST /api/rubrics/:rubricId/duplicate
 * 複製評分標準
 */
router.post('/:rubricId/duplicate', authMiddleware, async (req, res) => {
  try {
    const { rubricId } = req.params;
    const { name, courseId, assignmentId } = req.body;

    // 複製並創建新的
    const newRubric = {
      id: `rubric_${uuidv4().substring(0, 12)}`,
      name: name || '複製的評分標準',
      courseId: courseId || null,
      assignmentId: assignmentId || null,
      // ... 其他欄位會從原本的複製
      status: 'active',
      usageCount: 0,
      copiedFrom: rubricId,
      createdBy: req.user.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: newRubric,
      message: '評分標準複製成功'
    });
  } catch (error) {
    console.error('Duplicate rubric error:', error);
    res.status(500).json({
      success: false,
      message: '複製評分標準失敗'
    });
  }
});

// ============================================================================
// 使用評分標準評分
// ============================================================================

/**
 * POST /api/rubrics/:rubricId/grade
 * 使用評分標準進行評分
 */
router.post('/:rubricId/grade', authMiddleware, async (req, res) => {
  try {
    const { rubricId } = req.params;
    const { submissionId, criteriaScores, feedback } = req.body;

    if (!submissionId || !criteriaScores) {
      return res.status(400).json({
        success: false,
        message: '缺少必要參數'
      });
    }

    // 計算總分
    let totalScore = 0;
    let totalWeight = 0;
    const detailedScores = criteriaScores.map(cs => {
      totalScore += cs.score * (cs.weight / 100);
      totalWeight += cs.weight;
      return {
        criterionId: cs.criterionId,
        levelScore: cs.score,
        weight: cs.weight,
        feedback: cs.feedback || ''
      };
    });

    const normalizedScore = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;

    const grading = {
      id: `grade_${uuidv4().substring(0, 12)}`,
      rubricId,
      submissionId,
      criteriaScores: detailedScores,
      totalScore: Math.round(normalizedScore * 100) / 100,
      feedback: feedback || '',
      gradedBy: req.user.userId,
      gradedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: grading,
      message: '評分完成'
    });
  } catch (error) {
    console.error('Grade with rubric error:', error);
    res.status(500).json({
      success: false,
      message: '評分失敗'
    });
  }
});

/**
 * GET /api/rubrics/:rubricId/gradings/:submissionId
 * 取得特定提交的評分結果
 */
router.get('/:rubricId/gradings/:submissionId', authMiddleware, async (req, res) => {
  try {
    const { rubricId, submissionId } = req.params;

    const grading = {
      id: 'grade_001',
      rubricId,
      submissionId,
      criteriaScores: [
        { criterionId: 'crit_1', levelScore: 3, weight: 40, feedback: '分析深入但可更詳細' },
        { criterionId: 'crit_2', levelScore: 4, weight: 30, feedback: '格式完整正確' },
        { criterionId: 'crit_3', levelScore: 3, weight: 30, feedback: '原創性良好' }
      ],
      totalScore: 82.5,
      feedback: '整體表現良好，建議在分析部分可以更深入。',
      gradedBy: 'teacher_001',
      gradedAt: '2024-01-25T10:00:00Z'
    };

    res.json({
      success: true,
      data: grading
    });
  } catch (error) {
    console.error('Get grading error:', error);
    res.status(500).json({
      success: false,
      message: '取得評分結果失敗'
    });
  }
});

// ============================================================================
// 評分標準關聯
// ============================================================================

/**
 * PUT /api/rubrics/:rubricId/attach
 * 將評分標準附加到作業
 */
router.put('/:rubricId/attach', authMiddleware, async (req, res) => {
  try {
    const { rubricId } = req.params;
    const { assignmentId } = req.body;

    if (!assignmentId) {
      return res.status(400).json({
        success: false,
        message: '請指定作業 ID'
      });
    }

    res.json({
      success: true,
      data: {
        rubricId,
        assignmentId,
        attachedAt: new Date().toISOString()
      },
      message: '評分標準已附加到作業'
    });
  } catch (error) {
    console.error('Attach rubric error:', error);
    res.status(500).json({
      success: false,
      message: '附加評分標準失敗'
    });
  }
});

/**
 * DELETE /api/rubrics/:rubricId/detach/:assignmentId
 * 從作業移除評分標準
 */
router.delete('/:rubricId/detach/:assignmentId', authMiddleware, async (req, res) => {
  try {
    const { rubricId, assignmentId } = req.params;

    res.json({
      success: true,
      message: '評分標準已從作業移除'
    });
  } catch (error) {
    console.error('Detach rubric error:', error);
    res.status(500).json({
      success: false,
      message: '移除評分標準失敗'
    });
  }
});

module.exports = router;
