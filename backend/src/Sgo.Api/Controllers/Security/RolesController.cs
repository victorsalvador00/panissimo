using Microsoft.AspNetCore.Mvc;
using Sgo.Api.Auth;
using Sgo.Application.Common;
using Sgo.Application.Security;
using Sgo.Domain.Security;

namespace Sgo.Api.Controllers.Security;

[ApiController]
[Route("roles")]
[Tags("Roles y permisos")]
[RequirePermission(Permissions.SecurityRolesManage)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class RolesController(IRoleService roles) : ControllerBase
{
    [HttpGet]
    public Task<PagedResult<RoleListItemDto>> List([FromQuery] PageQuery query, CancellationToken ct) =>
        roles.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<RoleDto> Get(Guid id, CancellationToken ct) => roles.GetAsync(id, ct);

    /// <summary>Crea un rol. Solo puedes otorgar permisos que tú tienes.</summary>
    [HttpPost]
    [ProducesResponseType<RoleDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<RoleDto>> Create(CreateRoleRequest request, CancellationToken ct)
    {
        var role = await roles.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = role.Id }, role);
    }

    /// <summary>Edita un rol. El rol Administrador conserva siempre todos los permisos.</summary>
    [HttpPut("{id:guid}")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<RoleDto> Update(Guid id, UpdateRoleRequest request, CancellationToken ct) =>
        roles.UpdateAsync(id, request, ct);
}

[ApiController]
[Route("permissions")]
[Tags("Roles y permisos")]
[RequirePermission(Permissions.SecurityRolesManage)]
public sealed class PermissionsController : ControllerBase
{
    /// <summary>Catálogo fijo de permisos, agrupado por módulo.</summary>
    [HttpGet]
    public IReadOnlyList<PermissionGroupDto> List() =>
        Permissions.All
            .GroupBy(p => p.Module)
            .Select(g => new PermissionGroupDto(g.Key, g.Select(p => new PermissionDto(p.Code, p.Description)).ToList()))
            .ToList();
}

[ApiController]
[Route("audit-log")]
[Tags("Bitácora")]
[RequirePermission(Permissions.SecurityAuditView)]
public sealed class AuditLogController(IAuditLogQueries auditLog) : ControllerBase
{
    /// <summary>Bitácora de cambios, del más reciente al más antiguo. Filtros: entityType, entityId, userId, from, to.</summary>
    [HttpGet]
    public Task<PagedResult<AuditLogDto>> List([FromQuery] AuditLogQuery query, CancellationToken ct) =>
        auditLog.ListAsync(query, ct);
}
