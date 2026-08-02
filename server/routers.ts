import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  adminRouter,
  callsRouter,
  contractsRouter,
  customersRouter,
  forecastRouter,
  invoicesRouter,
  vesselsRouter,
  paymentContactsRouter,
  receiptsRouter,
  reportsRouter,
  tasksRouter,
  teamRouter,
} from "./routers/ar";
import { addressBookRouter } from "./routers/addressBook";
import { questionsRouter } from "./routers/questions";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  customers: customersRouter,
  addressBook: addressBookRouter,
  invoices: invoicesRouter,
  vessels: vesselsRouter,
  team: teamRouter,
  receipts: receiptsRouter,
  contracts: contractsRouter,
  tasks: tasksRouter,
  calls: callsRouter,
  paymentContacts: paymentContactsRouter,
  forecast: forecastRouter,
  reports: reportsRouter,
  questions: questionsRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
