interface VerificationEmailParams {
    to: string;
    name?: string | null;
    verifyUrl: string;
}
export declare function sendVerificationEmail({ to, name, verifyUrl, }: VerificationEmailParams): Promise<void>;
export {};
//# sourceMappingURL=email.d.ts.map