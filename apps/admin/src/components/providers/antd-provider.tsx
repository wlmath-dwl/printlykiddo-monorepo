"use client";

import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ConfigProvider, App as AntdApp, theme } from "antd";
import type { PropsWithChildren } from "react";

export function AntdProvider({ children }: PropsWithChildren) {
  return (
    <AntdRegistry>
      <ConfigProvider
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: {
            colorPrimary: "#1677ff",
            borderRadius: 10,
          },
        }}
      >
        <AntdApp>{children}</AntdApp>
      </ConfigProvider>
    </AntdRegistry>
  );
}
