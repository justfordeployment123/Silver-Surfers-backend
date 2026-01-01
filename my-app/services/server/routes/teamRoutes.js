import { Router } from 'express';
import { authRequired } from '../auth.js';
import * as teamController from '../controllers/teamController.js';

const router = Router();

router.post('/subscription/team/add', authRequired, teamController.addTeamMember);
router.post('/subscription/team/leave', authRequired, teamController.leaveTeam);
router.post('/subscription/team/remove', authRequired, teamController.removeTeamMember);
router.get('/subscription/team', authRequired, teamController.getTeamMembers);
router.get('/subscription/team/scans', authRequired, teamController.getTeamScans);
router.get('/subscription/team/invite/:token', teamController.getTeamInvite);
router.post('/subscription/team/accept', authRequired, teamController.acceptTeamInvite);

export default router;



