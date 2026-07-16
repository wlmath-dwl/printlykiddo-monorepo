"use client";

import {
  AppstoreOutlined,
  BookOutlined,
  CalculatorOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DatabaseOutlined,
  FolderOpenOutlined,
  HomeOutlined,
  LinkOutlined,
  PictureOutlined,
  ProfileOutlined,
  GlobalOutlined,
  PushpinOutlined,
  NodeIndexOutlined,
  VideoCameraOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Button, Layout, Menu } from "antd";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type PropsWithChildren, useMemo, useState } from "react";

import { LOCAL_DB_VIEW_TABLES } from "@/lib/local-db-viewer-tables";

import styles from "./admin-shell.module.css";
import { SyncToolbar } from "./sync-toolbar";

const { Content, Sider } = Layout;

const localDataSubmenuKey = "submenu-local-data";
const tracingSubmenuKey = "submenu-tracing";

const menuItems = [
  {
    key: "/admin/homepage",
    icon: <HomeOutlined />,
    label: <Link href="/admin/homepage">首页管理</Link>,
  },
  {
    key: "/admin/categories",
    icon: <FolderOpenOutlined />,
    label: <Link href="/admin/categories">分类管理</Link>,
  },
  {
    key: "/admin/actives",
    icon: <AppstoreOutlined />,
    label: <Link href="/admin/actives">功能管理</Link>,
  },
  {
    key: "/admin/imgs",
    icon: <PictureOutlined />,
    label: <Link href="/admin/imgs">图片管理</Link>,
  },
  {
    key: "/admin/special-pages",
    icon: <ProfileOutlined />,
    label: <Link href="/admin/special-pages">专题页管理</Link>,
  },
  {
    key: "/admin/puzzles",
    icon: <CalculatorOutlined />,
    label: <Link href="/admin/puzzles">益智类管理</Link>,
  },
  {
    key: "/admin/tools",
    icon: <ToolOutlined />,
    label: <Link href="/admin/tools">工具管理</Link>,
  },
  {
    key: "/admin/activity-library",
    icon: <BookOutlined />,
    label: <Link href="/admin/activity-library">活动素材库</Link>,
  },
  {
    key: "/admin/site-pages",
    icon: <GlobalOutlined />,
    label: <Link href="/admin/site-pages">URL 与静态页</Link>,
  },
  {
    key: tracingSubmenuKey,
    icon: <NodeIndexOutlined />,
    label: "Tracing 生成器",
    children: [
      {
        key: "/admin/tracing/line",
        label: <Link href="/admin/tracing/line">Line Tracing</Link>,
      },
    ],
  },
  {
    key: "/admin/backlink-exchanges",
    icon: <LinkOutlined />,
    label: <Link href="/admin/backlink-exchanges">外链管理</Link>,
  },
  {
    key: "/admin/pin-publish",
    icon: <PushpinOutlined />,
    label: <Link href="/admin/pin-publish">Pin 图发布管理</Link>,
  },
  {
    key: "/admin/video-cycles",
    icon: <VideoCameraOutlined />,
    label: <Link href="/admin/video-cycles">视频周期管理</Link>,
  },
  {
    key: localDataSubmenuKey,
    icon: <DatabaseOutlined />,
    label: "本地数据",
    children: LOCAL_DB_VIEW_TABLES.map((t) => ({
      key: `/admin/local-data/${t.name}`,
      label: <Link href={`/admin/local-data/${t.name}`}>{t.label}</Link>,
    })),
  },
];

function resolveMenuSelectedKey(pathname: string): string {
  if (pathname === "/admin/local-data") {
    return `/admin/local-data/${LOCAL_DB_VIEW_TABLES[0].name}`;
  }

  if (pathname.startsWith("/admin/local-data/")) {
    return pathname;
  }

  if (pathname.startsWith("/admin/categories")) {
    return "/admin/categories";
  }

  if (pathname.startsWith("/admin/actives")) {
    return "/admin/actives";
  }

  if (pathname.startsWith("/admin/imgs")) {
    return "/admin/imgs";
  }

  if (pathname.startsWith("/admin/special-pages")) {
    return "/admin/special-pages";
  }

  if (pathname.startsWith("/admin/sudoku-generator")) {
    return "/admin/sudoku-generator";
  }

  if (pathname === "/admin/puzzles" || pathname.startsWith("/admin/puzzles/")) {
    return "/admin/puzzles";
  }

  if (pathname.startsWith("/admin/tools")) {
    return "/admin/tools";
  }

  if (pathname.startsWith("/admin/activity-library")) {
    return "/admin/activity-library";
  }

  if (pathname.startsWith("/admin/site-pages")) {
    return "/admin/site-pages";
  }

  if (pathname.startsWith("/admin/maze-generator")) {
    return "/admin/maze-generator";
  }

  if (pathname.startsWith("/admin/irregular-maze")) {
    return "/admin/irregular-maze";
  }

  if (pathname.startsWith("/admin/maze-themes")) {
    return "/admin/maze-themes";
  }

  if (pathname.startsWith("/admin/tracing/line")) {
    return "/admin/tracing/line";
  }

  if (pathname.startsWith("/admin/backlink-exchanges")) {
    return "/admin/backlink-exchanges";
  }

  if (pathname.startsWith("/admin/pin-publish")) {
    return "/admin/pin-publish";
  }

  if (pathname.startsWith("/admin/video-cycles")) {
    return "/admin/video-cycles";
  }

  return pathname;
}

export function AdminShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const selectedKey = resolveMenuSelectedKey(pathname);
  const [manualOpenKeys, setManualOpenKeys] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const openKeys = useMemo(() => {
    if (collapsed) {
      return [];
    }

    const requiredKeys = pathname.startsWith("/admin/local-data")
      ? [localDataSubmenuKey]
      : pathname.startsWith("/admin/tracing")
        ? [tracingSubmenuKey]
        : [];
    if (requiredKeys.length > 0) {
      return [...new Set([...manualOpenKeys, ...requiredKeys])];
    }

    return manualOpenKeys;
  }, [collapsed, manualOpenKeys, pathname]);

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        width={240}
        collapsedWidth={80}
        collapsed={collapsed}
        trigger={null}
        theme="light"
        style={{ borderRight: "1px solid #f0f0f0" }}
      >
        <div className={styles.logo}>
          {collapsed ? <span className={styles.logoShort}>KPA</span> : <span>Kid Print Admin</span>}
          <Button
            type="text"
            size="small"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
          />
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          openKeys={openKeys}
          onOpenChange={setManualOpenKeys}
          items={menuItems}
        />
      </Sider>

      <Layout>
        <div className={styles.topbar}>
          <SyncToolbar />
        </div>
        <Content className={styles.content}>{children}</Content>
      </Layout>
    </Layout>
  );
}
