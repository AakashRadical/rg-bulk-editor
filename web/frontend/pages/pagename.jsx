import { TitleBar } from "@shopify/app-bridge-react";
import { Layout, LegacyCard, Page, Text } from "@shopify/polaris";
import { useTranslation } from "react-i18next";

export default function PageName() {
  const { t } = useTranslation();
  return (
    <Page>
      <TitleBar title={t("PageName.title")}>
        <button variant="primary" onClick={() => console.log("Primary action")}>
          {t("PageName.primaryAction")}
        </button>
        <button onClick={() => console.log("Secondary action")}>
          {t("PageName.secondaryAction")}
        </button>
      </TitleBar>
      <Layout>
        <Layout.Section>
          <LegacyCard sectioned>
            <Text variant="headingMd" as="h2">
              {t("PageName.heading")}
            </Text>
              <p>{t("PageName.body")}</p>
          </LegacyCard>
          <LegacyCard sectioned>
            <Text variant="headingMd" as="h2">
              {t("PageName.heading")}
            </Text>
              <p>{t("PageName.body")}</p>
          </LegacyCard>
        </Layout.Section>
        <Layout.Section secondary>
          <LegacyCard sectioned>
            <Text variant="headingMd" as="h2">
              {t("PageName.heading")}
            </Text>
              <p>{t("PageName.body")}</p>
          </LegacyCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
