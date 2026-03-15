declare module "nodemailer" {
  namespace nodemailer {
    export type Transporter = any;
    export type SendMailOptions = any;
  }
  const nodemailer: {
    createTransport: (...args: any[]) => nodemailer.Transporter;
  };
  export = nodemailer;
}
