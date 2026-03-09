/**
 * 評分標準 (Rubrics) API
 * BeyondBridge Education Platform
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');

const TEACHING_ROLES = new Set([
  'manager',
  'coursecreator',
  'educator',
  'trainer',
  'creator',
  'teacher',
  'assistant'
]);

function isTeachingUser(user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return TEACHING_ROLES.has(user.role);
}

function ensureTeachingAccess(user, res) {
  if (isTeachingUser(user)) return true;
  res.status(403).json({
    success: false,
    message: '僅教師或管理員可使用評分標準功能'
  });
  return false;
}

function parseNumber(value, fallback = 0, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeLevels(levels = []) {
  return (Array.isArray(levels) ? levels : []).map((level, idx) => ({
    id: level.levelId || level.id || `level_${idx + 1}`,
    levelId: level.levelId || level.id || `level_${idx + 1}`,
    name: level.name || level.label || `Level ${idx + 1}`,
    label: level.label || level.name || `Level ${idx + 1}`,
    description: level.description || '',
    score: parseNumber(level.score ?? level.points, 0, { min: 0 })
  }));
}

function normalizeCriteria(criteria = []) {
  return (Array.isArray(criteria) ? criteria : []).map((criterion, idx) => {
    const levels = normalizeLevels(criterion.levels);
    const maxLevelScore = levels.length > 0
      ? Math.max(...levels.map(l => parseNumber(l.score, 0, { min: 0 })))
      : 0;
    const maxScore = parseNumber(
      criterion.maxScore ?? criterion.points ?? maxLevelScore,
      maxLevelScore,
      { min: 0 }
    );

    return {
      id: criterion.criterionId || criterion.id || `crit_${idx + 1}`,
      criterionId: criterion.criterionId || criterion.id || `crit_${idx + 1}`,
      name: criterion.name || `Criterion ${idx + 1}`,
      description: criterion.description || '',
      weight: parseNumber(criterion.weight, 0, { min: 0 }),
      maxScore,
      points: maxScore,
      levels
    };
  });
}

function calculateRubricMaxScore(criteria = []) {
  return normalizeCriteria(criteria).reduce((sum, criterion) => sum + (criterion.maxScore || 0), 0);
}

function normalizeRubric(item) {
  const rubricId = item.rubricId || item.id;
  const criteria = normalizeCriteria(item.criteria || []);
  const maxScore = parseNumber(item.maxScore, calculateRubricMaxScore(criteria), { min: 0 });

  return {
    id: rubricId,
    rubricId,
    name: item.name || '',
    description: item.description || '',
    courseId: item.courseId || null,
    assignmentId: item.assignmentId || null,
    criteria,
    maxScore,
    status: item.status || 'draft',
    templateId: item.templateId || null,
    usageCount: parseNumber(item.usageCount, 0, { min: 0 }),
    createdBy: item.createdBy || null,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
}

async function getRubricById(rubricId) {
  const direct = await db.getItem(`RUBRIC#${rubricId}`, 'META');
  if (direct && direct.entityType === 'RUBRIC' && direct.status !== 'deleted') return direct;

  const fallback = await db.scan({
    filter: {
      expression: 'entityType = :type AND rubricId = :rid AND (#status <> :deleted OR attribute_not_exists(#status))',
      values: { ':type': 'RUBRIC', ':rid': rubricId, ':deleted': 'deleted' },
      names: { '#status': 'status' }
    }
  });
  return fallback[0] || null;
}

const BUILTIN_TEMPLATES = [
  {
    id: 'template_essay',
    rubricId: 'template_essay',
    name: '論文寫作評分範本',
    description: '適用於論文與報告類型作業',
    criteria: [
      {
        id: 'crit_argument',
        name: '論點與邏輯',
        description: '論點是否完整且邏輯一致',
        maxScore: 40,
        levels: [
          { name: '優秀', score: 40, description: '論點清晰且邏輯嚴謹' },
          { name: '良好', score: 30, description: '論點完整，邏輯大致通順' },
          { name: '待加強', score: 20, description: '論點尚可，但邏輯不夠清楚' }
        ]
      },
      {
        id: 'crit_evidence',
        name: '資料引用',
        description: '引用來源與格式是否正確',
        maxScore: 30,
        levels: [
          { name: '優秀', score: 30, description: '引用充分且格式正確' },
          { name: '良好', score: 22, description: '引用適當，少量格式錯誤' },
          { name: '待加強', score: 15, description: '引用不足或格式錯誤明顯' }
        ]
      },
      {
        id: 'crit_expression',
        name: '文字表達',
        description: '內容可讀性與語句流暢度',
        maxScore: 30,
        levels: [
          { name: '優秀', score: 30, description: '文字流暢且錯誤極少' },
          { name: '良好', score: 22, description: '文字清楚，偶有錯誤' },
          { name: '待加強', score: 15, description: '語句不順或錯誤偏多' }
        ]
      }
    ],
    maxScore: 100
  },
  {
    id: 'template_presentation',
    rubricId: 'template_presentation',
    name: '簡報口頭報告範本',
    description: '適用於簡報展示與口頭報告',
    criteria: [
      {
        id: 'crit_structure',
        name: '內容結構',
        description: '簡報架構與流程',
        maxScore: 35,
        levels: [
          { name: '優秀', score: 35 },
          { name: '良好', score: 28 },
          { name: '待加強', score: 20 }
        ]
      },
      {
        id: 'crit_delivery',
        name: '表達能力',
        description: '口語表達與臨場反應',
        maxScore: 35,
        levels: [
          { name: '優秀', score: 35 },
          { name: '良好', score: 28 },
          { name: '待加強', score: 20 }
        ]
      },
      {
        id: 'crit_visual',
        name: '視覺設計',
        description: '版面與視覺傳達',
        maxScore: 30,
        levels: [
          { name: '優秀', score: 30 },
          { name: '良好', score: 24 },
          { name: '待加強', score: 16 }
        ]
      }
    ],
    maxScore: 100
  }
];

async function getTemplateById(templateId) {
  const builtin = BUILTIN_TEMPLATES.find(t => t.id === templateId || t.rubricId === templateId);
  if (builtin) return builtin;

  const custom = await db.scan({
    filter: {
      expression: 'entityType = :type AND templateId = :tid',
      values: { ':type': 'RUBRIC_TEMPLATE', ':tid': templateId }
    }
  });
  return custom[0] || null;
}

// ============================================================================
// 評分標準範本
// ============================================================================

router.get('/templates', authMiddleware, async (req, res) => {
  try {
    if (!ensureTeachingAccess(req.user, res)) return;

    const customTemplates = await db.scan({
      filter: {
        expression: 'entityType = :type AND (#status <> :deleted OR attribute_not_exists(#status))',
        values: { ':type': 'RUBRIC_TEMPLATE', ':deleted': 'deleted' },
        names: { '#status': 'status' }
      }
    });

    const templates = [
      ...BUILTIN_TEMPLATES.map(t => ({
        ...normalizeRubric(t),
        templateId: t.id,
        isSystemTemplate: true
      })),
      ...customTemplates.map(t => ({
        ...normalizeRubric(t),
        templateId: t.templateId || t.id,
        isSystemTemplate: false
      }))
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

router.get('/', authMiddleware, async (req, res) => {
  try {
    if (!ensureTeachingAccess(req.user, res)) return;

    const { courseId, assignmentId } = req.query;

    let rubrics = await db.scan({
      filter: {
        expression: 'entityType = :type AND (#status <> :deleted OR attribute_not_exists(#status))',
        values: { ':type': 'RUBRIC', ':deleted': 'deleted' },
        names: { '#status': 'status' }
      }
    });

    if (!isTeachingUser(req.user)) {
      rubrics = rubrics.filter(r => (r.status || 'draft') === 'active');
    }

    if (courseId) {
      rubrics = rubrics.filter(r => r.courseId === courseId);
    }
    if (assignmentId) {
      rubrics = rubrics.filter(r => r.assignmentId === assignmentId);
    }

    rubrics.sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    res.json({
      success: true,
      data: rubrics.map(normalizeRubric)
    });
  } catch (error) {
    console.error('Get rubrics error:', error);
    res.status(500).json({
      success: false,
      message: '取得評分標準失敗'
    });
  }
});

router.get('/:rubricId', authMiddleware, async (req, res) => {
  try {
    if (!ensureTeachingAccess(req.user, res)) return;

    const { rubricId } = req.params;
    const rubric = await getRubricById(rubricId);
    if (!rubric) {
      return res.status(404).json({
        success: false,
        message: '找不到評分標準'
      });
    }

    if (!isTeachingUser(req.user) && (rubric.status || 'draft') !== 'active') {
      return res.status(403).json({
        success: false,
        message: '無權限查看此評分標準'
      });
    }

    res.json({
      success: true,
      data: normalizeRubric(rubric)
    });
  } catch (error) {
    console.error('Get rubric error:', error);
    res.status(500).json({
      success: false,
      message: '取得評分標準失敗'
    });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可建立評分標準'
      });
    }

    const {
      name,
      description,
      courseId,
      assignmentId,
      criteria,
      templateId,
      status = 'draft'
    } = req.body;

    let finalCriteria = normalizeCriteria(criteria || []);
    let finalName = (name || '').trim();
    let finalDescription = description || '';

    if (templateId && finalCriteria.length === 0) {
      const template = await getTemplateById(templateId);
      if (template) {
        finalCriteria = normalizeCriteria(template.criteria || []);
        if (!finalName) finalName = template.name;
        if (!finalDescription) finalDescription = template.description || '';
      }
    }

    if (!finalName) {
      return res.status(400).json({
        success: false,
        message: '請提供評分標準名稱'
      });
    }

    const rubricId = db.generateId('rubric');
    const now = new Date().toISOString();
    const rubric = {
      PK: `RUBRIC#${rubricId}`,
      SK: 'META',
      entityType: 'RUBRIC',
      rubricId,
      name: finalName,
      description: finalDescription,
      courseId: courseId || null,
      assignmentId: assignmentId || null,
      criteria: finalCriteria,
      maxScore: calculateRubricMaxScore(finalCriteria),
      status: status || 'draft',
      templateId: templateId || null,
      usageCount: 0,
      createdBy: req.user.userId,
      createdAt: now,
      updatedAt: now
    };

    await db.putItem(rubric);

    if (assignmentId) {
      await db.putItem({
        PK: `ASSIGNMENT#${assignmentId}`,
        SK: 'RUBRIC',
        entityType: 'ASSIGNMENT_RUBRIC',
        assignmentId,
        rubricId,
        attachedBy: req.user.userId,
        attachedAt: now
      });
    }

    res.status(201).json({
      success: true,
      data: normalizeRubric(rubric),
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

router.put('/:rubricId', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可更新評分標準'
      });
    }

    const { rubricId } = req.params;
    const rubric = await getRubricById(rubricId);
    if (!rubric) {
      return res.status(404).json({
        success: false,
        message: '找不到評分標準'
      });
    }

    if (!req.user.isAdmin && rubric.createdBy && rubric.createdBy !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: '無權限更新此評分標準'
      });
    }

    const updates = {
      updatedAt: new Date().toISOString()
    };

    if (req.body.name !== undefined) updates.name = String(req.body.name || '').trim();
    if (req.body.description !== undefined) updates.description = String(req.body.description || '');
    if (req.body.courseId !== undefined) updates.courseId = req.body.courseId || null;
    if (req.body.status !== undefined) updates.status = req.body.status || 'draft';
    if (req.body.templateId !== undefined) updates.templateId = req.body.templateId || null;

    if (req.body.criteria !== undefined) {
      const finalCriteria = normalizeCriteria(req.body.criteria || []);
      updates.criteria = finalCriteria;
      updates.maxScore = calculateRubricMaxScore(finalCriteria);
    }

    if (req.body.assignmentId !== undefined) {
      updates.assignmentId = req.body.assignmentId || null;
    }

    const updated = await db.updateItem(rubric.PK, rubric.SK, updates);

    if (req.body.assignmentId !== undefined && rubric.assignmentId !== updates.assignmentId) {
      if (rubric.assignmentId) {
        await db.deleteItem(`ASSIGNMENT#${rubric.assignmentId}`, 'RUBRIC');
      }
      if (updates.assignmentId) {
        await db.putItem({
          PK: `ASSIGNMENT#${updates.assignmentId}`,
          SK: 'RUBRIC',
          entityType: 'ASSIGNMENT_RUBRIC',
          assignmentId: updates.assignmentId,
          rubricId,
          attachedBy: req.user.userId,
          attachedAt: new Date().toISOString()
        });
      }
    }

    res.json({
      success: true,
      data: normalizeRubric(updated),
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

router.delete('/:rubricId', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可刪除評分標準'
      });
    }

    const { rubricId } = req.params;
    const rubric = await getRubricById(rubricId);
    if (!rubric) {
      return res.status(404).json({
        success: false,
        message: '找不到評分標準'
      });
    }

    if (!req.user.isAdmin && rubric.createdBy && rubric.createdBy !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: '無權限刪除此評分標準'
      });
    }

    await db.updateItem(rubric.PK, rubric.SK, {
      status: 'deleted',
      updatedAt: new Date().toISOString()
    });

    if (rubric.assignmentId) {
      await db.deleteItem(`ASSIGNMENT#${rubric.assignmentId}`, 'RUBRIC');
    }

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

router.post('/:rubricId/duplicate', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可複製評分標準'
      });
    }

    const { rubricId } = req.params;
    let source = await getRubricById(rubricId);
    if (!source) {
      const template = await getTemplateById(rubricId);
      if (template) {
        source = {
          rubricId: template.rubricId || template.id,
          name: template.name,
          description: template.description || '',
          criteria: normalizeCriteria(template.criteria || []),
          maxScore: template.maxScore || calculateRubricMaxScore(template.criteria || []),
          status: 'active',
          templateId: template.id || template.rubricId
        };
      }
    }

    if (!source) {
      return res.status(404).json({
        success: false,
        message: '找不到來源評分標準'
      });
    }

    const newRubricId = db.generateId('rubric');
    const now = new Date().toISOString();
    const duplicated = {
      PK: `RUBRIC#${newRubricId}`,
      SK: 'META',
      entityType: 'RUBRIC',
      rubricId: newRubricId,
      name: (req.body.name || `${source.name}（複本）`).trim(),
      description: req.body.description !== undefined ? req.body.description : (source.description || ''),
      courseId: req.body.courseId !== undefined ? (req.body.courseId || null) : (source.courseId || null),
      assignmentId: req.body.assignmentId !== undefined ? (req.body.assignmentId || null) : null,
      criteria: normalizeCriteria(source.criteria || []),
      maxScore: source.maxScore || calculateRubricMaxScore(source.criteria || []),
      status: req.body.status || source.status || 'draft',
      templateId: source.templateId || null,
      usageCount: 0,
      copiedFrom: source.rubricId || rubricId,
      createdBy: req.user.userId,
      createdAt: now,
      updatedAt: now
    };

    await db.putItem(duplicated);

    if (duplicated.assignmentId) {
      await db.putItem({
        PK: `ASSIGNMENT#${duplicated.assignmentId}`,
        SK: 'RUBRIC',
        entityType: 'ASSIGNMENT_RUBRIC',
        assignmentId: duplicated.assignmentId,
        rubricId: duplicated.rubricId,
        attachedBy: req.user.userId,
        attachedAt: now
      });
    }

    res.status(201).json({
      success: true,
      data: normalizeRubric(duplicated),
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

router.post('/:rubricId/grade', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可進行評分'
      });
    }

    const { rubricId } = req.params;
    const { submissionId, criteriaScores = [], feedback = '' } = req.body;

    if (!submissionId) {
      return res.status(400).json({
        success: false,
        message: '缺少 submissionId'
      });
    }

    const rubric = await getRubricById(rubricId);
    if (!rubric) {
      return res.status(404).json({
        success: false,
        message: '找不到評分標準'
      });
    }

    const normalizedRubric = normalizeRubric(rubric);
    const criteriaMap = new Map(normalizedRubric.criteria.map(c => [c.criterionId, c]));

    const detailedScores = (Array.isArray(criteriaScores) ? criteriaScores : []).map(score => {
      const criterionId = score.criterionId || score.id;
      const criterion = criteriaMap.get(criterionId);
      const levelScore = parseNumber(score.score ?? score.levelScore, 0, { min: 0 });
      return {
        criterionId,
        criterionName: criterion?.name || '',
        levelScore,
        maxScore: criterion?.maxScore || 0,
        feedback: score.feedback || ''
      };
    });

    const totalScore = detailedScores.reduce((sum, s) => sum + s.levelScore, 0);
    const grading = {
      PK: `RUBRIC#${rubricId}`,
      SK: `GRADING#${submissionId}`,
      entityType: 'RUBRIC_GRADING',
      gradingId: db.generateId('grade'),
      rubricId,
      submissionId,
      criteriaScores: detailedScores,
      totalScore: Math.round(totalScore * 100) / 100,
      maxScore: normalizedRubric.maxScore || 0,
      feedback: String(feedback || ''),
      gradedBy: req.user.userId,
      gradedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.putItem(grading);
    await db.updateItem(rubric.PK, rubric.SK, {
      usageCount: (rubric.usageCount || 0) + 1,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        id: grading.gradingId,
        ...grading
      },
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

router.get('/:rubricId/gradings/:submissionId', authMiddleware, async (req, res) => {
  try {
    const { rubricId, submissionId } = req.params;
    const grading = await db.getItem(`RUBRIC#${rubricId}`, `GRADING#${submissionId}`);

    if (!grading || grading.entityType !== 'RUBRIC_GRADING') {
      return res.status(404).json({
        success: false,
        message: '找不到評分結果'
      });
    }

    res.json({
      success: true,
      data: {
        id: grading.gradingId,
        ...grading
      }
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

router.put('/:rubricId/attach', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可附加評分標準'
      });
    }

    const { rubricId } = req.params;
    const { assignmentId } = req.body;
    if (!assignmentId) {
      return res.status(400).json({
        success: false,
        message: '請指定作業 ID'
      });
    }

    const rubric = await getRubricById(rubricId);
    if (!rubric) {
      return res.status(404).json({
        success: false,
        message: '找不到評分標準'
      });
    }

    const now = new Date().toISOString();
    await db.putItem({
      PK: `ASSIGNMENT#${assignmentId}`,
      SK: 'RUBRIC',
      entityType: 'ASSIGNMENT_RUBRIC',
      assignmentId,
      rubricId,
      attachedBy: req.user.userId,
      attachedAt: now
    });

    await db.updateItem(rubric.PK, rubric.SK, {
      assignmentId,
      updatedAt: now
    });

    res.json({
      success: true,
      data: {
        rubricId,
        assignmentId,
        attachedAt: now
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

router.delete('/:rubricId/detach/:assignmentId', authMiddleware, async (req, res) => {
  try {
    if (!isTeachingUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: '僅教師或管理員可移除評分標準'
      });
    }

    const { rubricId, assignmentId } = req.params;
    const rubric = await getRubricById(rubricId);
    if (!rubric) {
      return res.status(404).json({
        success: false,
        message: '找不到評分標準'
      });
    }

    await db.deleteItem(`ASSIGNMENT#${assignmentId}`, 'RUBRIC');
    if (rubric.assignmentId === assignmentId) {
      await db.updateItem(rubric.PK, rubric.SK, {
        assignmentId: null,
        updatedAt: new Date().toISOString()
      });
    }

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
