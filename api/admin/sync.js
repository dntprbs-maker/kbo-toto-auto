// 관리자 대시보드용 파이프라인 단계별 실행 API (action 파라미터로 단계 분기)
// 실제 로직은 api/_utils/pipeline.js에 있으며, api/cron.js와 공유한다.
import { actionSchedule, actionAi, actionMerge, actionBets } from '../_utils/pipeline.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    return res.status(500).json({ error: 'Firebase 환경변수가 설정되지 않았습니다.' });
  }

  const { action, modelIndex } = req.body || {};

  try {
    let result;
    switch (action) {
      case 'schedule': result = await actionSchedule(); break;
      case 'ai':       result = await actionAi(modelIndex); break;
      case 'merge':    result = await actionMerge(); break;
      case 'bets':     result = await actionBets(); break;
      default:
        return res.status(400).json({ error: `알 수 없는 action: ${action}` });
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error(`[sync/${action}] 오류:`, err);
    return res.status(500).json({ error: err.message });
  }
}
