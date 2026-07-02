// 매일 자동 실행되는 KBO 예측 파이프라인 (Vercel Cron 전용 진입점)
// 실제 단계별 로직은 api/_utils/pipeline.js에 있으며, api/admin/sync.js(수동 대시보드)와 공유한다.
// 0단계 일정 → 1~3단계 AI 예측(반짝이/별이/초롱이) → 4단계 취합 → 5단계 베팅 생성 순으로 실행.
import { actionSchedule, actionAi, actionMerge, actionBets } from './_utils/pipeline.js';

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  const force = req.query?.force === 'true';
  if (!force && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.GEMINI_API_KEY || !process.env.FIREBASE_SERVICE_ACCOUNT) {
    return res.status(500).json({ error: '환경변수 설정 누락' });
  }

  const steps = {};
  try {
    steps.schedule = await actionSchedule();

    if (!steps.schedule.tomorrow.isMonday && steps.schedule.tomorrow.count > 0) {
      steps.ai1 = await actionAi(0);
      steps.ai2 = await actionAi(1);
      steps.ai3 = await actionAi(2);
      steps.merge = await actionMerge();
      steps.bets = await actionBets();
    }

    const summary = steps.schedule.tomorrow.isMonday
      ? `✅ 오늘 ${steps.schedule.today.count}경기 확인. 내일(월요일) 예측 없음.`
      : `✅ 오늘 ${steps.schedule.today.count}경기 + 내일 ${steps.schedule.tomorrow.count}경기 예측 파이프라인 완료.`;

    console.log(summary);
    return res.status(200).json({ success: true, message: summary, steps });
  } catch (error) {
    console.error('Cron 실행 오류:', error);
    return res.status(500).json({ success: false, error: error.message, steps });
  }
}
