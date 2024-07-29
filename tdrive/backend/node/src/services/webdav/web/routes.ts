import { FastifyPluginCallback } from "fastify";
import type { Authenticator, AuthResponse, User } from "nephele";
import * as express from "express";
import fastifyExpress from "@fastify/express";
import { adapterServiceReady, getAdapterService } from "./adapter";
import gr from "../../global-resolver";
import { executionStorage } from "../../../core/platform/framework/execution-storage";

const webdavUrl = "webdav";
async function builder(nephele: any) {
  const routes: FastifyPluginCallback = async (fastify, options, next) => {
    const authenticator = {
      authenticate: async (request: express.Request, response: AuthResponse): Promise<User> => {
        // console.log(request.headers, request.cookies, request.body, request.secret);
        if (request.headers.authorization) {
          // TODO: make auth just via login and password and not id's
          const base64Credentials = request.headers.authorization.split(" ")[1];
          const credentials = Buffer.from(base64Credentials, "base64").toString("utf8");
          const device_id = credentials.split(":")[0];
          const company_id = credentials.split(":")[1];
          const user = await gr.services.users.get({ id: device_id });
          response.locals.user = {
            username: device_id,
            groupname: company_id,
          } as User;
          executionStorage.getStore().user_id = user.id;
          executionStorage.getStore().company_id = company_id;
          response.setHeader("WWW-Authenticate", "Basic");
          return response.locals.user;
        } else {
          // response.statusCode = 401;
          response.setHeader("WWW-Authenticate", "Basic");
          throw new nephele.UnauthorizedError("Unauthorized user!");
        }
      },
      cleanAuthentication: async (
        request: express.Request,
        response: AuthResponse,
      ): Promise<void> => {
        // TODO: think about cleaning the user
        response.set("WWW-Authenticate", "Basic");
        console.log("AUTHENTICATOR::cleanAuthentication is called()");
      },
    } as Authenticator;

    await adapterServiceReady;
    const adapter = getAdapterService();
    fastify.register(fastifyExpress).after(() => {
      // Create Nephele server
      const server = nephele.createServer({
        adapter: adapter, // You need to define this
        authenticator: authenticator, // You need to define this
        plugins: {},
      });

      // Create an Express middleware that uses the Nephele server
      const webdavMiddleware = express.Router();
      webdavMiddleware.use(express.urlencoded({ extended: true }));
      webdavMiddleware.use((req, res, next) => {
        server(req, res, err => {
          if (err) {
            fastify.log.error("Nephele error:", err);
            res.status(500).send("Internal Server Error");
          } else {
            next();
          }
        });
      });
      fastify.use(`${webdavUrl}`, webdavMiddleware);
    });
    fastify.all("webdav/*", (request, reply) => {
      console.log(request);
      reply.send({ message: "Test route" });
    });
    fastify.all("webdav", (request, reply) => {
      reply.send({ message: "Test route" });
    });
    console.debug(fastify.printRoutes());
    next();
  };

  return routes;
}
export const routes = eval("import('nephele').then(builder)");
function extractUser(url: string) {
  return url;
}
