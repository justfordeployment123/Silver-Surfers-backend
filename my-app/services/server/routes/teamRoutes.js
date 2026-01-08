/**
 * Team Routes
 */

import express from 'express';
import { authRequired } from '../auth.js';
import * as teamController from '../controllers/teamController.js';

const router = express.Router();

// Add team member
router.post('/subscription/team/add', authRequired, teamController.addTeamMember);

// Leave team
router.post('/subscription/team/leave', authRequired, teamController.leaveTeam);

// Remove team member
router.post('/subscription/team/remove', authRequired, teamController.removeTeamMember);

// Get team
router.get('/subscription/team', authRequired, teamController.getTeam);

// Get team scans
router.get('/subscription/team/scans', authRequired, teamController.getTeamScans);

// Accept team invite
router.get('/subscription/team/invite/:token', teamController.getInvite);

// Accept team invite (POST)
router.post('/subscription/team/accept', authRequired, teamController.acceptInvite);

export default router;


