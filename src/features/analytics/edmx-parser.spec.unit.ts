import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AzureDevOpsError } from '../../shared/errors/index.ts';
import { parseEdmxMetadata } from './edmx-parser.ts';

const SAMPLE_EDMX = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <!-- Azure DevOps Analytics sample schema -->
    <Schema Namespace="Microsoft.VisualStudio.Services.Analytics.Model" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="BaseAnalyticsEntity">
        <Key>
          <PropertyRef Name="AnalyticsUpdatedDate" />
        </Key>
        <Property Name="AnalyticsUpdatedDate" Type="Edm.DateTimeOffset" Nullable="false" />
      </EntityType>
      <EntityType Name="WorkItem" BaseType="Microsoft.VisualStudio.Services.Analytics.Model.BaseAnalyticsEntity">
        <Key>
          <PropertyRef Name="WorkItemId" />
        </Key>
        <Property Name="WorkItemId" Type="Edm.Int32" Nullable="false" />
        <Property Name="Title" Type="Edm.String">
          <Annotation Term="DisplayName" String="Title &amp; Summary" />
        </Property>
        <Property Name='CycleTimeDays' Type='Edm.Double' />
        <Property Name="Custom_Team" Type="Edm.String" />
        <Property Name="Custom_RiskScore" Type="Edm.Int32" Nullable="true" />
        <NavigationProperty Name="Area" Type="Microsoft.VisualStudio.Services.Analytics.Model.Area" />
        <NavigationProperty Name="Children" Type="Collection(Microsoft.VisualStudio.Services.Analytics.Model.WorkItem)" />
      </EntityType>
      <EntityType Name="WorkItemSnapshot">
        <Key>
          <PropertyRef Name="DateSK" />
        </Key>
        <Property Name="DateSK" Type="Edm.Int32" Nullable="false" />
        <Property Name="State" Type="Edm.String" />
      </EntityType>
      <EntityContainer Name="Analytics">
        <EntitySet Name="WorkItems" EntityType="Microsoft.VisualStudio.Services.Analytics.Model.WorkItem" />
        <EntitySet Name="WorkItemSnapshot" EntityType="Microsoft.VisualStudio.Services.Analytics.Model.WorkItemSnapshot" />
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

void describe('parseEdmxMetadata', () => {
  void it('parses EntitySets, EntityTypes, Keys, Properties (including Custom_*), and NavigationProperties', () => {
    const parsed = parseEdmxMetadata(SAMPLE_EDMX);

    assert.equal(
      parsed.namespace,
      'Microsoft.VisualStudio.Services.Analytics.Model',
    );
    assert.deepEqual(
      parsed.entitySets.map((es) => es.name),
      ['WorkItems', 'WorkItemSnapshot'],
    );
    assert.equal(parsed.entitySets[0].shortEntityType, 'WorkItem');

    const wi = parsed.entityTypes.get('WorkItem');
    assert.ok(wi);
    // Includes inherited key and property from BaseAnalyticsEntity
    assert.deepEqual(wi.keys, ['AnalyticsUpdatedDate', 'WorkItemId']);

    const propNames = wi.properties.map((p) => p.name);
    assert.deepEqual(propNames, [
      'AnalyticsUpdatedDate',
      'WorkItemId',
      'Title',
      'CycleTimeDays',
      'Custom_Team',
      'Custom_RiskScore',
    ]);

    const wiIdProp = wi.properties.find((p) => p.name === 'WorkItemId');
    assert.deepEqual(wiIdProp, {
      name: 'WorkItemId',
      type: 'Edm.Int32',
      nullable: false,
    });

    const cycleProp = wi.properties.find((p) => p.name === 'CycleTimeDays');
    assert.deepEqual(cycleProp, {
      name: 'CycleTimeDays',
      type: 'Edm.Double',
      nullable: true,
    });

    assert.deepEqual(wi.navigationProperties, [
      {
        name: 'Area',
        type: 'Microsoft.VisualStudio.Services.Analytics.Model.Area',
        isCollection: false,
      },
      {
        name: 'Children',
        type: 'Collection(Microsoft.VisualStudio.Services.Analytics.Model.WorkItem)',
        isCollection: true,
      },
    ]);
  });

  void it('handles namespace-prefixed tags and cyclic BaseType safely', () => {
    const cyclicEdmx = `
      <edmx:Edmx Version="4.0">
        <edmx:DataServices>
          <edm:Schema Namespace="Test.Model">
            <edm:EntityType Name="A" BaseType="Test.Model.B">
              <edm:Property Name="PropA" Type="Edm.String" />
            </edm:EntityType>
            <edm:EntityType Name="B" BaseType="Test.Model.A">
              <edm:Property Name="PropB" Type="Edm.Int32" Nullable="false" />
            </edm:EntityType>
            <edm:EntityContainer Name="Default">
              <edm:EntitySet Name="As" EntityType="Test.Model.A" />
            </edm:EntityContainer>
          </edm:Schema>
        </edmx:DataServices>
      </edmx:Edmx>`;

    const parsed = parseEdmxMetadata(cyclicEdmx);
    assert.equal(parsed.entitySets.length, 1);
    const typeA = parsed.entityTypes.get('A');
    assert.ok(typeA);
    assert.ok(typeA.properties.some((p) => p.name === 'PropA'));
    assert.ok(typeA.properties.some((p) => p.name === 'PropB'));
  });

  void it('rejects empty or non-EDMX payloads with AzureDevOpsError', () => {
    assert.throws(() => parseEdmxMetadata(''), AzureDevOpsError);
    assert.throws(
      () => parseEdmxMetadata('<html><body>Sign in</body></html>'),
      AzureDevOpsError,
    );
  });
});
