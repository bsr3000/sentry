import React from 'react';
import {shallow, mount} from 'enzyme';

import {Client} from 'app/api';
import OrganizationAuditLog from 'app/views/settings/organizationAuditLog';

jest.mock('jquery');

describe('OrganizationAuditLog', function() {
  const org = TestStubs.Organization();
  const ENDPOINT = `/organizations/${org.slug}/audit-logs/`;

  beforeEach(function() {
    Client.clearMockResponses();
    Client.addMockResponse({
      url: ENDPOINT,
      body: TestStubs.AuditLogs(),
    });
  });

  it('renders', function(done) {
    const wrapper = shallow(
      <OrganizationAuditLog location={{query: ''}} params={{orgId: org.slug}} />,
      TestStubs.routerContext()
    );
    wrapper.setState({loading: false});
    wrapper.update();
    setTimeout(() => {
      wrapper.update();
      expect(wrapper).toMatchSnapshot();
      done();
    });
  });

  it('displays whether an action was done by a superuser', function() {
    const wrapper = mount(
      <OrganizationAuditLog location={{query: ''}} params={{orgId: org.slug}} />,
      TestStubs.routerContext()
    );
    expect(
      wrapper
        .find('div[data-test-id="actor-name"]')
        .at(0)
        .text()
    ).toEqual(expect.stringContaining('(Sentry Staff)'));
    expect(
      wrapper
        .find('div[data-test-id="actor-name"]')
        .at(1)
        .text()
    ).toEqual(expect.not.stringContaining('(Sentry Staff)'));
  });
});
