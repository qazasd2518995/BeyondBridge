# Interactive Video Sidebar Design

## Goal

Add a new course activity mode, `interactive_video`, that combines:

- YouTube video playback
- a right-side teacher-led conversation panel
- timeline-triggered questions
- persistent learner attempts
- scoring, progress tracking, and analytics

The intended learning flow is:

1. Learner opens an interactive video activity.
2. Video plays on the left.
3. At configured timestamps, the player pauses automatically.
4. The sidebar shows a teacher avatar and a scripted question.
5. The learner answers in the sidebar.
6. Feedback is shown.
7. The learner resumes playback.
8. Final completion, score, and watch metrics are stored.

## Why This Should Not Reuse Chat

This feature should not be built on top of the existing support chat system.

Reasons:

- It is single-learner, not multi-party.
- It is timeline-driven, not message-stream driven.
- It needs deterministic prompts and scoring.
- It must integrate with course progress, gradebook, and reports.

The UI can look like chat, but the implementation should be an `interactive_video` engine.

## Existing Platform Building Blocks

Relevant files:

- `backend/public/platform/js/moodle-ui.js`
- `backend/public/platform/js/api.js`
- `backend/src/handlers/courses/sections.js`
- `backend/src/handlers/courses/progress.js`
- `backend/src/handlers/gradebook.js`
- `backend/src/handlers/courses/reports.js`

Useful existing behavior:

- course activity viewer shell already exists
- old video center already uses YouTube IFrame API and timeline sync
- course progress already supports:
  - `activityProgressMap`
  - `activityAccessMap`
  - `activityTimeMap`
  - `totalTimeSpent`

Current limitation:

- the current course video viewer is a plain embed and cannot pause at defined timestamps

## Activity Model

Extend course activities to allow `type = interactive_video`.

Recommended `META` payload:

```json
{
  "type": "interactive_video",
  "title": "正念冥想入門",
  "description": "跟著影片學習，並在過程中回答互動問題。",
  "youtubeId": "abc123xyz89",
  "videoUrl": "https://www.youtube.com/watch?v=abc123xyz89",
  "durationSeconds": 780,
  "gradingMode": "graded",
  "passingScore": 70,
  "completionRule": {
    "minWatchPercent": 85,
    "requiredPromptMode": "all"
  },
  "sidebarTheme": {
    "speakerName": "林老師",
    "speakerAvatar": "/uploads/teacher-lin.png"
  }
}
```

## Prompt Model

Each interactive checkpoint should be stored separately.

Recommended item shape:

```json
{
  "PK": "INTERACTIVE_VIDEO#act_123",
  "SK": "PROMPT#000120",
  "entityType": "INTERACTIVE_VIDEO_PROMPT",
  "activityId": "act_123",
  "promptId": "prompt_001",
  "triggerSecond": 120,
  "order": 1,
  "speakerName": "林老師",
  "speakerAvatar": "/uploads/teacher-lin.png",
  "questionType": "single_choice",
  "question": "這段練習最重要的核心是什麼？",
  "options": [
    { "value": "a", "label": "放空" },
    { "value": "b", "label": "專注當下" },
    { "value": "c", "label": "壓抑情緒" }
  ],
  "correctAnswer": "b",
  "points": 10,
  "required": true,
  "pauseVideo": true,
  "feedbackCorrect": "對，這段的重點是回到當下。",
  "feedbackIncorrect": "再想想看，影片剛剛一直強調的是覺察。"
}
```

Supported first-version question types:

- `single_choice`
- `true_false`
- `short_text_reflection`

Scoring in v1:

- `single_choice` and `true_false` are gradable
- `short_text_reflection` is stored but not auto-graded

## Attempt Model

Store one active attempt per user per activity, with resumable state.

Recommended item shape:

```json
{
  "PK": "USER#usr_123",
  "SK": "INTERACTIVE_VIDEO#act_123",
  "entityType": "INTERACTIVE_VIDEO_ATTEMPT",
  "userId": "usr_123",
  "courseId": "course_123",
  "activityId": "act_123",
  "status": "in_progress",
  "watchedSeconds": 302,
  "lastPositionSecond": 297,
  "progressPercentage": 38,
  "triggeredPromptIds": ["prompt_001", "prompt_002"],
  "answeredPromptIds": ["prompt_001"],
  "answers": {
    "prompt_001": {
      "answer": "b",
      "isCorrect": true,
      "pointsEarned": 10,
      "answeredAt": "2026-04-01T10:00:00.000Z"
    }
  },
  "score": 10,
  "maxScore": 20,
  "watchSegments": [
    { "from": 0, "to": 118 },
    { "from": 118, "to": 297 }
  ],
  "lastAccessedAt": "2026-04-01T10:02:30.000Z",
  "startedAt": "2026-04-01T09:58:00.000Z",
  "completedAt": null,
  "updatedAt": "2026-04-01T10:02:30.000Z"
}
```

Optional v2 metrics:

- `pauseCount`
- `seekEvents`
- `rewatchSeconds`
- `answerLatencyMs`

## Backend API

### Read activity package

`GET /api/interactive-videos/:activityId`

Returns:

- activity meta
- prompt list
- learner's latest attempt snapshot

### Create or resume session

`POST /api/interactive-videos/:activityId/session`

Returns:

- current attempt
- resume position
- unanswered prompt state

### Heartbeat

`POST /api/interactive-videos/:activityId/session/heartbeat`

Payload:

```json
{
  "currentTime": 297,
  "playedDelta": 12,
  "playerState": "playing",
  "visible": true
}
```

Rules:

- only accumulate watch time when:
  - player is `playing`
  - document is visible
  - viewer is still open
- ignore raw modal-open time

### Submit answer

`POST /api/interactive-videos/:activityId/session/answer`

Payload:

```json
{
  "promptId": "prompt_001",
  "answer": "b",
  "currentTime": 120
}
```

Returns:

- correctness
- earned points
- feedback
- updated score
- whether playback may continue

### Complete attempt

`POST /api/interactive-videos/:activityId/session/complete`

Calculates:

- completion status
- final score
- final watch percentage
- whether gradebook entry should be written

### Teacher report

`GET /api/interactive-videos/:activityId/report`

Returns:

- total learners
- average watch time
- average completion
- average score
- per-prompt accuracy
- dropout hotspots

## Frontend State Flow

Main runtime states:

- `idle`
- `loading`
- `playing`
- `prompt_open`
- `answer_submitting`
- `feedback_open`
- `completed`

Main client-side services:

- YouTube player adapter
- checkpoint engine
- heartbeat sync
- answer submission handler
- sidebar renderer

### Checkpoint engine

Never trigger on exact equality.

Correct logic:

- poll current time every `250-500ms`
- if `currentTime >= triggerSecond`
- and prompt has not been triggered
- then pause and open prompt

Must also handle:

- seek forward
- resume after refresh
- already answered prompts

## UI Layout

Recommended desktop layout:

- left: video player, 65-70%
- right: sidebar, 30-35%

Sidebar sections:

- teacher intro bubble
- prompt thread
- learner responses
- feedback bubbles
- progress summary

Required controls:

- continue playback
- replay previous segment
- skip forbidden when prompt is required

Mobile behavior:

- video first
- sidebar collapses into bottom sheet or stacked panel

## Progress Integration

This feature should write to the course progress model.

Map values into existing progress data:

- `activityAccessMap[activityId] = lastAccessedAt`
- `activityTimeMap[activityId] += watchedSeconds`
- `activityProgressMap[activityId] = watch/completion percent`
- `totalTimeSpent += watchedSeconds`

Mark activity complete when:

- minimum watch threshold met
- all required prompts answered

## Gradebook Integration

If `gradingMode = graded`:

- create one gradebook item for the interactive video
- sync `score/maxScore`
- include in course gradebook

If `gradingMode = practice`:

- do not create grade item
- still persist attempt, watch time, and analytics

## Report Integration

Teacher analytics should show:

- who started
- who finished
- watch percentage
- watch duration
- score
- prompt-by-prompt correctness
- most abandoned timestamp range

Recommended future dashboard cards:

- average watch completion
- at-risk learners who dropped before key checkpoints
- weakest prompt
- strongest prompt

## Teacher Authoring UX

Do not require raw JSON editing.

Recommended v1 authoring flow:

1. paste YouTube URL
2. open preview player
3. click "add prompt at current time"
4. form opens with current timestamp prefilled
5. teacher fills:
   - question
   - options
   - correct answer
   - points
   - required or optional
   - feedback
6. save
7. preview sidebar behavior

Helpful editing affordances:

- prompt timeline list
- drag reorder
- jump to prompt time
- duplicate prompt

## Recommended Delivery Phases

### Phase 1

- add `interactive_video` activity type
- build YouTube player adapter
- build right sidebar shell
- add timeline prompt trigger and pause/resume
- persist answers and watched time

### Phase 2

- connect completion logic to course progress
- add score calculation
- write graded attempts into gradebook
- add learner summary UI

### Phase 3

- teacher authoring UI
- analytics report
- mobile polish
- retry/review mode

## Risks

- relying on modal-open duration instead of true playback time
- missing checkpoints after fast seek
- duplicate prompt triggers after refresh
- mixing old video progress storage with new activity-based storage
- trying to retrofit support chat instead of building a deterministic engine

## Recommendation

Build this as a native `interactive_video` course activity with:

- YouTube API playback control
- scripted sidebar prompts
- attempt persistence
- gradebook and analytics integration

This will produce a much stronger learning and reporting model than simple video progress tracking.
