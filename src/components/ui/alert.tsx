import * as React from "react";

function Alert({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`relative w-full rounded-lg border p-4 ${className}`}
      {...props}
    />
  );
}

function AlertDescription({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <div className={`text-sm ${className}`} {...props} />;
}

export { Alert, AlertDescription };
