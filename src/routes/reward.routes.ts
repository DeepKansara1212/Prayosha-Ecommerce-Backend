import { Router } from "express";
import { getRewardsBalance, getRewardsHistory } from "../controllers/reward.controller";
import { verifyJWT } from "../middleware/auth";

const rewardRouter = Router();

rewardRouter.get("/balance", verifyJWT, getRewardsBalance);
rewardRouter.get("/history", verifyJWT, getRewardsHistory);

export default rewardRouter;
