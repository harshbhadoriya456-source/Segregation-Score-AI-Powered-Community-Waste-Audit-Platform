This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Waste audit configuration

Image analysis runs on the server through Amazon Rekognition. Configure AWS credentials using the AWS SDK's standard credential provider chain and grant the application permission to call `rekognition:DetectLabels`. Set `AWS_REGION` to the region containing the Rekognition service; when omitted, the API uses `ap-south-1`. Keep AWS credentials server-side and do not prefix them with `NEXT_PUBLIC_`.

The analysis API first runs the local TACO-trained YOLO26n checkpoint on CPU using Python and the installed `ultralytics` package. If inference fails, it falls back to Amazon Rekognition. Set `YOLO_MODEL_PATH` to override the checkpoint location (default: `C:\segregation-score\runs\taco\baseline\weights\best.pt`) and `PYTHON_EXECUTABLE` to the Python executable that has `ultralytics` installed (default: `python`). The Python script is `scripts/yolo_inference.py`. Model detections and confidence scores are visual predictions only; they do not verify the physical object, material, or waste segregation.

Optionally set `WASTE_DISPOSAL_GUIDANCE` to locally maintained disposal guidance. The value is shown with the analysis recommendations; it does not replace local verification or establish universal recycling rules.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
