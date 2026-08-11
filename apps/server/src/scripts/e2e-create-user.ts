import { auth } from '@church/auth';

interface CreateE2eUserInput {
  email: string;
  name: string;
  password: string;
}

function parseInput(): CreateE2eUserInput {
  const [email, name, password] = Bun.argv.slice(2);
  if (!email || !name || !password) {
    throw new Error('Expected email, name, and password arguments.');
  }
  return { email, name, password };
}

const input = parseInput();
const account = await auth.api.signUpEmail({ body: input });
console.log(JSON.stringify({ user: { id: account.user.id } }));
