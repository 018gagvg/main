import { NextApiRequest, NextApiResponse } from 'next';

const handler = async (_req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  // This handler calls .end twice. We test this to verify that this still doesn't throw because we're wrapping `.end`.
  res.status(200).json({ success: true });
  res.end();
};

export default handler;
