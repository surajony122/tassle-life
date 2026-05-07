import { exec } from "child_process";

export const loader = async () => {
  return new Promise((resolve) => {
    exec("npx prisma db push --accept-data-loss", (error, stdout, stderr) => {
      if (error) {
        resolve(new Response("Error:\n" + error.message + "\n\nStderr:\n" + stderr, { status: 500 }));
        return;
      }
      resolve(new Response("Success!\n\nStdout:\n" + stdout + "\n\nStderr:\n" + stderr, { status: 200 }));
    });
  });
};
