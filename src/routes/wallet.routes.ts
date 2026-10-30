import { Router } from "express";
import { getWalletBalance, getWalletHistory } from "../controllers/wallet.controller";
import { verifyJWT } from "../middleware/auth";

const walletRouter = Router();

walletRouter.get("/balance", verifyJWT, getWalletBalance);
walletRouter.get("/history", verifyJWT, getWalletHistory);

export default walletRouter;
