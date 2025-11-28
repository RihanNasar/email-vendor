"""
Add is_forwarded and is_reply columns to emails table
"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    op.add_column('emails', sa.Column('is_forwarded', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('emails', sa.Column('is_reply', sa.Boolean(), nullable=False, server_default=sa.false()))

def downgrade():
    op.drop_column('emails', 'is_forwarded')
    op.drop_column('emails', 'is_reply')
