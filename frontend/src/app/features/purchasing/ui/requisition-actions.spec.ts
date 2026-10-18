import { repeatedWithoutNote, requisitionActions } from './requisition-actions';

const all = () => true;
const only =
  (...granted: string[]) =>
  (p: string) =>
    granted.includes(p);

describe('requisitionActions (RN-34)', () => {
  it('a draft is edited, sent and cancelled by whoever manages requisitions', () => {
    expect(requisitionActions('Draft', all)).toEqual(['edit', 'submit', 'cancel']);
    expect(requisitionActions('Draft', only('purchasing.po.approve'))).toEqual([]);
  });

  it('a sent one is approved or rejected by the approver', () => {
    expect(requisitionActions('Submitted', only('purchasing.po.approve'))).toEqual([
      'approve',
      'reject',
    ]);
    expect(requisitionActions('Submitted', all)).toEqual(['approve', 'reject', 'cancel']);
  });

  it('an approved one converts to a purchase order; final states have nothing', () => {
    expect(requisitionActions('Approved', only('purchasing.po.manage'))).toEqual(['convert']);
    expect(requisitionActions('Converted', all)).toEqual([]);
    expect(requisitionActions('Rejected', all)).toEqual([]);
    expect(requisitionActions('Cancelled', all)).toEqual([]);
  });
});

describe('repeatedWithoutNote (RN-34)', () => {
  it('asks a note only on repeated items', () => {
    expect(
      repeatedWithoutNote([
        { itemId: 'a', notes: '' },
        { itemId: 'b', notes: '' },
        { itemId: 'a', notes: 'otro proveedor' },
        { itemId: 'a', notes: ' ' },
        { itemId: null, notes: '' },
      ]),
    ).toEqual([0, 3]);
  });
});
